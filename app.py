#!/usr/bin/env python3
"""
Instrument Server (Unified – Authoritative)

This server acts as the single point of truth for hardware access (TimeTagger and Laser).
It ensures:
- Safe, serialized hardware access via a single worker thread (HardwareWorker).
- Parity between REST API and Socket.IO interfaces.
- Real-time status broadcasting to multiple clients.
- Configurable, per-client measurement streams.

Architecture:
- **HardwareWorker**: Owns the physical device objects. executing jobs sequentially from a queue.
- **Flask Routes**: Handle REST requests, submitting jobs to the worker and waiting for results.
- **Socket.IO Events**: Handle real-time streaming and configuration.
- **Validation**: Strict input validation is applied before any logic execution, returning soft errors (200 OK with "status": 400) on failure.
"""

from __future__ import annotations

import logging
import sys
import queue
import threading
from typing import Any, Callable, Set, Dict, List, Union

from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
from flask_socketio import SocketIO, emit

# =================================================
# ================= DEPENDENCIES ==================
# =================================================

# TimeTagger Python bindings
sys.path.insert(0, "/usr/lib/python3/dist-packages")
from TimeTagger import createTimeTagger, Coincidences, Correlation, Countrate

# Laser controller
from matchbox2 import MatchBox2Laser

# =================================================
# ================= APP SETUP =====================
# =================================================

app = Flask(__name__)
CORS(app)

socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode="threading"
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("instrument_server")

# =================================================
# ================= CONSTANTS =====================
# =================================================

# Primes used for event division in testing mode to generate different frequencies
PRIMES = [
    77, 65, 51, 38, 23, 29, 31, 37,
    41, 43, 47, 53, 59, 61, 67, 71
]

DEFAULT_COUNTRATE_WINDOW_S = 1.0
Job = Callable[[Any], Any]

# =================================================
# ================= HELPERS =======================
# =================================================

def validate_arg(name: str, 
                type_func: Callable, 
                source: Dict[str, Any] = None, 
                min_val: Union[int, float] = None, 
                max_val: Union[int, float] = None, 
                default: Any = None, 
                required: bool = False) -> Any:
    """
    Validates an input argument from request.args or a dictionary source.

    Args:
        name: Parameter name.
        type_func: Function to convert the string input (e.g., int, float).
        source: Optional dictionary to look up values (for SocketIO messages). 
                If None, uses request.args.
        min_val: Minimum allowed value (inclusive).
        max_val: Maximum allowed value (inclusive).
        default: Default value if parameter is missing.
        required: If True, raises ValueError if parameter is missing.

    Returns:
        The validated and converted value.

    Raises:
        ValueError: If validation fails (missing required, wrong type, out of range).
    """
    # If source is provided (dict), use it; otherwise default to request.args
    if source is not None:
        val_str = source.get(name)
    else:
        val_str = request.args.get(name)

    if val_str is None:
        if required:
            raise ValueError(f"{name} param required")
        return default

    try:
        val = type_func(val_str)
    except (ValueError, TypeError):
        raise ValueError(f"{name} must be of type {type_func.__name__}")

    # Ensure consistent precision for floats
    if type_func is float:
        # Check if precision is greater than 1 decimal place
        if val != round(val, 1):
             raise ValueError(f"{name} must have at most 1 decimal place")
        val = round(val, 1)

    if min_val is not None and val < min_val:
        raise ValueError(f"{name} must be >= {min_val}")
    if max_val is not None and val > max_val:
        raise ValueError(f"{name} must be <= {max_val}")

    return val


@app.errorhandler(ValueError)
def handle_bad_request(e):
    """
    Handle validation errors globally.
    Returns a 200 OK response with status="error" to prevent client crashes.
    """
    return jsonify({"status": 400, "error": str(e)})


@app.errorhandler(Exception)
def handle_exception(e):
    """
    Handle unexpected exceptions globally.
    Log the error and return a soft error response.
    """
    logger.exception("An unhandled exception occurred")
    return jsonify({"status": 400, "error": str(e)})

# =================================================
# ============== HARDWARE WORKER =================
# =================================================

class HardwareWorker:
    """
    Owns all hardware objects and executes jobs sequentially in a single background thread.
    This ensures that hardware access is thread-safe and serialized.
    """

    def __init__(self):
        self.job_queue = queue.Queue()
        self.tagger = None
        self.laser = None
        self.stored_power = 0.0
        self.test_enabled_channels: Set[int] = set()

        threading.Thread(
            target=self._run,
            name="HardwareWorker",
            daemon=True
        ).start()

    def _init_tagger(self):
        """Initialize the TimeTagger."""
        if self.tagger is None:
            self.tagger = createTimeTagger()
            logger.info("TimeTagger initialized")

    def _init_laser(self):
        """Initialize and connect to the first available MatchBox2 laser."""
        if self.laser is None:
            lasers = MatchBox2Laser().get_available_lasers()
            if not lasers:
                raise RuntimeError("No laser detected")
            self.laser = MatchBox2Laser()
            self.laser.connect(lasers[0].portName)
            logger.info("Laser connected")

    def _run(self):
        """Main worker loop."""
        self._init_tagger()
        self._init_laser()

        while True:
            job_fn, result_q = self.job_queue.get()
            try:
                result_q.put(job_fn(self))
            except Exception as exc:
                logger.exception("Hardware job failed")
                result_q.put(exc)

    def submit(self, job_fn: Job, timeout: float = 5.0) -> Any:
        """
        Submit a job to the hardware thread and block until completion.

        Args:
            job_fn: A callable that takes 'self' (HardwareWorker instance) as argument.
            timeout: Max time to wait for the job to complete.

        Returns:
            The return value of job_fn.

        Raises:
            TimeoutError: If the job takes longer than timeout.
            Exception: Re-raises any exception that occurred within the job.
        """
        q = queue.Queue(maxsize=1)
        self.job_queue.put((job_fn, q))
        try:
            result = q.get(timeout=timeout)
        except queue.Empty:
            raise TimeoutError("Hardware job timed out")

        if isinstance(result, Exception):
            raise result
        return result


# Singleton hardware worker instance
hw = HardwareWorker()

# =================================================
# =================== WEB UI ======================
# =================================================

@app.route("/")
def index():
    """Serve the main frontend page."""
    return render_template("index.html")

# =================================================
# ================ TESTING CONTROL ================
# =================================================

@app.route("/timetagger/testing")
def timetagger_testing():
    """
    Enable or disable internal test signals on the TimeTagger.
    Input:
        enable (int): 1 to enable, 0 to disable (default 0).
        ch (str): Comma-separated list of channels (e.g., "1,2").
    """
    enable = validate_arg("enable", int, min_val=0, max_val=1, default=0) != 0
    val_str = request.args.get("ch", "")
    channels = [int(x) for x in val_str.split(",") if x.strip()]

    def job(hw):
        t = hw.tagger

        if not enable:
            # Disable test signals for specified channels (or all active if none specified)
            for ch in list(hw.test_enabled_channels):
                if not channels or ch in channels:
                    t.setTestSignal([ch], False)
                    t.setEventDivider(ch, 1)
                    hw.test_enabled_channels.remove(ch)
        else:
            # Enable test signals with prime dividers to create unique rates
            for i, ch in enumerate(channels):
                if ch in hw.test_enabled_channels:
                    continue
                t.setTestSignal([ch], True)
                t.setEventDivider(ch, PRIMES[i % len(PRIMES)])
                hw.test_enabled_channels.add(ch)

        return {
            "status": 200,
            "test_enabled_channels": sorted(hw.test_enabled_channels)
        }

    return jsonify(hw.submit(job))


@app.route("/timetagger/status")
def timetagger_status():
    """Return current status of TimeTagger (test signals)."""
    return jsonify(hw.submit(
        lambda hw: {
            "status": 200,
            "test_enabled_channels": sorted(hw.test_enabled_channels)
        }
    ))

# =================================================
# ================= TIMETAGGER REST ===============
# =================================================

@app.route("/timetagger/countrate")
def timetagger_countrate():
    """
    Measure count rates on specified channels.
    Input:
        ch (str): Comma-separated channels.
        rtime (float): Integration time in seconds (0.1 to 5.0).
    """
    channels = [int(x) for x in request.args.get("ch", "").split(",") if x.strip()]
    rtime = validate_arg("rtime", float, min_val=0.1, max_val=5.0, default=DEFAULT_COUNTRATE_WINDOW_S)

    def job(hw):
        with Countrate(hw.tagger, channels) as cr:
            cr.startFor(int(rtime * 1e12))
            cr.waitUntilFinished()
            return {
                "status": 200,
                "recording_time": rtime,
                "channel_click_rate": dict(zip(channels, map(int, cr.getData())))
            }

    return jsonify(hw.submit(job))


@app.route("/timetagger/coincidence")
def timetagger_coincidence():
    """
    Measure coincidence rates between groups of channels.
    Input:
        groups (str): Semicolon-separated groups, e.g., "1,2;3,4".
        cwin (int): Coincidence window in ps (1000 to 10000).
        rtime (float): Integration time in seconds (0.1 to 5.0).
    """
    groups = [
        [int(x) for x in g.split(",") if x.strip()]
        for g in request.args.get("groups", "").split(";") if g.strip()
    ]
    cwin = validate_arg("cwin", int, min_val=1000, max_val=10000, default=1000)
    rtime = validate_arg("rtime", float, min_val=0.1, max_val=5.0, default=1.0)

    def job(hw):
        with Coincidences(hw.tagger, groups, cwin) as co:
            vchs = list(co.getChannels())
            with Countrate(hw.tagger, vchs) as cr:
                cr.startFor(int(rtime * 1e12))
                cr.waitUntilFinished()
                return {
                    "status": 200,
                    "virtual_groups": groups,
                    "coincidence_click_rate": list(map(int, cr.getData())),
                    "recording_time": rtime,
                    "coincidence_window": cwin * 1e-12
                }

    return jsonify(hw.submit(job))


@app.route("/timetagger/correlation")
def timetagger_correlation():
    """
    Measure correlation histogram between two channels.
    Input:
        ch (str): Two channels "ch1,ch2".
        bwidth (int): Bin width in ps (1000 to 10000).
        nbins (int): Number of bins (10 to 100).
        rtime (float): Integration time in seconds (0.1 to 5.0).
    """
    ch1, ch2 = map(int, request.args["ch"].split(","))
    bwidth = validate_arg("bwidth", int, min_val=1000, max_val=10000, required=True)
    nbins = validate_arg("nbins", int, min_val=10, max_val=100, required=True)
    rtime = validate_arg("rtime", float, min_val=0.1, max_val=5.0, required=True)

    def job(hw):
        corr = Correlation(hw.tagger, ch1, ch2, bwidth, nbins)
        corr.startFor(int(rtime * 1e12))
        corr.waitUntilFinished()
        return {
            "status": 200,
            "tau_ps": corr.getIndex().tolist(),
            "counts": corr.getData().tolist(),
            "recording_time": rtime,
            "window_sec": (bwidth * nbins) * 1e-12
        }

    return jsonify(hw.submit(job))

# =================================================
# =================== LASER REST ==================
# =================================================

@app.route("/laser/control")
def laser_control():
    """
    Control laser power and state.
    Input:
        switch (int): 1 to turn ON, 0 to turn OFF.
        power (float): Optical power in mW (1.0 to 5.0). Only applied if switch=1.
    """
    switch = validate_arg("switch", int, min_val=0, max_val=1, required=True)
    has_power_param = request.args.get("power") is not None
    
    power_val = 1.0
    if switch == 1 and has_power_param:
        power_val = validate_arg("power", float, min_val=1.0, max_val=5.0, default=1.0)

    def job(hw):
        if switch == 0:
            # STRICT VALIDATION: reject 'power' param if switching OFF
            if has_power_param:
                raise ValueError("Power parameter not allowed when switching off")
            
            # SAFETY: Set power to 1.0 before turning off
            hw.laser.set_laser_off()
            hw.laser.set_optical_power(1.0)
            hw.stored_power = 0.0
            
        elif switch == 1:
            hw.laser.set_optical_power(power_val)
            hw.laser.set_laser_on()
            hw.stored_power = power_val
            
        r = hw.laser.get_laser_readings()
        return {"status": 200, "power_state": r.power_state, "power": hw.stored_power}

    return jsonify(hw.submit(job))


@app.route("/laser/status")
def laser_status():
    """Get current laser readings."""
    return jsonify(hw.submit(laser_status_job))

# =================================================
# ============== SHARED STATUS SOCKETS ============
# =================================================

laser_clients = 0
timetagger_clients = 0
laser_lock = threading.Lock()
tt_lock = threading.Lock()

def laser_status_job(hw):
    r = hw.laser.get_laser_readings()
    # Sync: If physical laser is OFF, force stored_power to 0.0
    # This handles cases where laser was turned off manually/externally
    if r.power_state == "OFF":
        hw.stored_power = 0.0
        
    return {"status": 200, **r.__dict__, "power": hw.stored_power}

def timetagger_status_job(hw):
    return {"status": 200, "test_enabled_channels": sorted(hw.test_enabled_channels)}

def laser_broadcaster():
    """Background thread to broadcast laser status to connected clients."""
    while True:
        with laser_lock:
            if laser_clients == 0:
                socketio.sleep(0.5)
                continue

        try:
            data = hw.submit(laser_status_job, 2.0)
            socketio.emit(
                "laser_status",
                data,
                namespace="/ws/laser/status"
            )
            socketio.sleep(1.0)

            

        except TimeoutError:
            # Hardware still initializing or busy — retry quietly
            socketio.sleep(0.5)

        except Exception as exc:
            logger.warning(f"Laser broadcaster error: {exc}")
            socketio.sleep(1.0)

def timetagger_broadcaster():
    """Background thread to broadcast TimeTagger status to connected clients."""
    while True:
        with tt_lock:
            if timetagger_clients == 0:
                socketio.sleep(0.5)
                continue

        try:
            data = hw.submit(timetagger_status_job, 2.0)
            socketio.emit(
                "timetagger_status",
                data,
                namespace="/ws/timetagger/status"
            )
            socketio.sleep(1.0)

        except TimeoutError:
            socketio.sleep(0.5)

        except Exception as exc:
            logger.warning(f"TimeTagger broadcaster error: {exc}")
            socketio.sleep(1.0)

# Start broadcaster threads
threading.Thread(target=laser_broadcaster, daemon=True).start()
threading.Thread(target=timetagger_broadcaster, daemon=True).start()

# ---------- Connection Handlers ----------

@socketio.on("connect", namespace="/ws/laser/status")
def laser_connect():
    global laser_clients
    with laser_lock:
        laser_clients += 1
    emit("connected")

@socketio.on("disconnect", namespace="/ws/laser/status")
def laser_disconnect():
    global laser_clients
    with laser_lock:
        laser_clients = max(0, laser_clients - 1)

@socketio.on("connect", namespace="/ws/timetagger/status")
def tt_connect():
    global timetagger_clients
    with tt_lock:
        timetagger_clients += 1
    emit("connected")

@socketio.on("disconnect", namespace="/ws/timetagger/status")
def tt_disconnect():
    global timetagger_clients
    with tt_lock:
        timetagger_clients = max(0, timetagger_clients - 1)

# =================================================
# ========== GENERIC PER-CLIENT STREAM BASE =======
# =================================================

def start_stream(store, lock, sid, worker_fn):
    """
    Start a dedicated streaming thread for a client.
    
    Args:
        store: Dictionary storing client state.
        lock: Lock protecting the store.
        sid: Session ID of the client.
        worker_fn: The worker function to run in a thread.
    """
    with lock:
        store[sid] = {
            "params": None,
            "version": 0,
            "stop": threading.Event()
        }
        threading.Thread(
            target=worker_fn,
            args=(sid,),
            daemon=True
        ).start()

def stop_stream(store, lock, sid):
    """Stop the streaming thread for a client."""
    with lock:
        state = store.pop(sid, None)
        if state:
            state["stop"].set()

# =================================================
# ========== COUNTRATE SOCKET =====================
# =================================================

countrate_clients = {}
countrate_lock = threading.Lock()

def countrate_worker(sid):
    """Worker thread for streaming countrates to a single client."""
    state = countrate_clients[sid]
    while not state["stop"].is_set():
        if not state["params"]:
            socketio.sleep(0.1)
            continue

        ch = state["params"]["ch"]
        rtime = state["params"]["rtime"]
        version = state["version"]
        channels = [int(x) for x in ch.split(",") if x.strip()]

        if hw.tagger is None:
            socketio.sleep(0.5)
            continue
            
        try:
             with Countrate(hw.tagger, channels) as cr:
                cr.startFor(int(rtime * 1e12))
                cr.waitUntilFinished()
                data = dict(zip(channels, map(int, cr.getData())))
        except Exception as e:
            logger.warning(f"Countrate worker error: {e}")
            socketio.sleep(1.0)
            continue

        # Check if configuration changed while we were measuring
        if version != state["version"]:
            continue

        socketio.emit(
            "countrate",
            {"status": 200, "rates": data, "ch": ch, "rtime": rtime},
            namespace="/ws/timetagger/countrate",
            to=sid
        )

@socketio.on("connect", namespace="/ws/timetagger/countrate")
def cr_connect():
    start_stream(countrate_clients, countrate_lock, request.sid, countrate_worker)
    emit("connected")

@socketio.on("configure", namespace="/ws/timetagger/countrate")
def cr_config(msg):
    """
    Configure countrate stream.
    Expected msg: {"ch": "1,2", "rtime": 1.0}
    """
    try:
        # Validate inputs
        try:
            rtime = validate_arg("rtime", float, source=msg, min_val=0.1, max_val=5.0, default=DEFAULT_COUNTRATE_WINDOW_S)
        except ValueError as e:
            emit("configured", {"status": 400, "error": str(e)})
            return

        with countrate_lock:
            s = countrate_clients[request.sid]
            # Store parameters
            s["params"] = {"ch": msg.get("ch", ""), "rtime": rtime}
            s["version"] += 1
        emit("configured", {"status": 200})
    except Exception as e:
        logger.exception("Error in countrate configure")
        emit("configured", {"status": 400, "error": str(e)})

@socketio.on("disconnect", namespace="/ws/timetagger/countrate")
def cr_disconnect():
    stop_stream(countrate_clients, countrate_lock, request.sid)

# =================================================
# ========== COINCIDENCE SOCKET ===================
# =================================================

coincidence_clients = {}
coincidence_lock = threading.Lock()

def coincidence_worker(sid):
    """Worker thread for streaming coincidence rates."""
    state = coincidence_clients[sid]
    while not state["stop"].is_set():
        if not state["params"]:
            socketio.sleep(0.1)
            continue

        p = state["params"]
        version = state["version"]

        if hw.tagger is None:
            socketio.sleep(0.5)
            continue

        try:
            with Coincidences(hw.tagger, p["groups"], p["cwin"]) as co:
                vchs = list(co.getChannels())
                with Countrate(hw.tagger, vchs) as cr:
                    cr.startFor(int(p["rtime"] * 1e12))
                    cr.waitUntilFinished()
                    data = list(map(int, cr.getData()))
        except Exception as e:
            logger.warning(f"Coincidence worker error: {e}")
            socketio.sleep(1.0)
            continue

        if version != state["version"]:
            continue

        socketio.emit(
            "coincidence",
            {"status": 200, **p, "rates": data},
            namespace="/ws/timetagger/coincidence",
            to=sid
        )

@socketio.on("connect", namespace="/ws/timetagger/coincidence")
def co_connect():
    start_stream(coincidence_clients, coincidence_lock, request.sid, coincidence_worker)
    emit("connected")

@socketio.on("configure", namespace="/ws/timetagger/coincidence")
def co_config(msg):
    """
    Configure coincidence stream.
    Expected msg: {"groups": "1,2;3,4", "cwin": 1000, "rtime": 1.0}
    """
    try:
        try:
            groups = [
                [int(x) for x in g.split(",") if x.strip()]
                for g in msg.get("groups", "").split(";") if g.strip()
            ]
            cwin = validate_arg("cwin", int, source=msg, min_val=1000, max_val=10000, default=1000)
            rtime = validate_arg("rtime", float, source=msg, min_val=0.1, max_val=5.0, default=1.0)
        except ValueError as e:
            emit("configured", {"status": 400, "error": str(e)})
            return

        with coincidence_lock:
            s = coincidence_clients[request.sid]
            s["params"] = {
                "groups": groups,
                "cwin": cwin,
                "rtime": rtime
            }
            s["version"] += 1
        emit("configured", {"status": 200})
    except Exception as e:
        logger.exception("Error in coincidence configure")
        emit("configured", {"status": 400, "error": str(e)})

@socketio.on("disconnect", namespace="/ws/timetagger/coincidence")
def co_disconnect():
    stop_stream(coincidence_clients, coincidence_lock, request.sid)

# =================================================
# ========== CORRELATION SOCKET ===================
# =================================================

correlation_clients = {}
correlation_lock = threading.Lock()

def correlation_worker(sid):
    """Worker thread for streaming correlation histograms."""
    state = correlation_clients[sid]
    while not state["stop"].is_set():
        if not state["params"]:
            socketio.sleep(0.1)
            continue

        p = state["params"]
        version = state["version"]

        if hw.tagger is None:
            socketio.sleep(0.5)
            continue

        try:
            corr = Correlation(hw.tagger, *p["ch"], p["bwidth"], p["nbins"])
            corr.startFor(int(p["rtime"] * 1e12))
            corr.waitUntilFinished()
            tau = corr.getIndex().tolist()
            counts = corr.getData().tolist()
        except Exception as e:
            logger.warning(f"Correlation worker error: {e}")
            socketio.sleep(1.0)
            continue

        if version != state["version"]:
            continue

        socketio.emit(
            "correlation",
            {"status": 200, **p, "tau_ps": tau, "counts": counts},
            namespace="/ws/timetagger/correlation",
            to=sid
        )

@socketio.on("connect", namespace="/ws/timetagger/correlation")
def corr_connect():
    start_stream(correlation_clients, correlation_lock, request.sid, correlation_worker)
    emit("connected")

@socketio.on("configure", namespace="/ws/timetagger/correlation")
def corr_config(msg):
    """
    Configure correlation stream.
    Expected msg: {"ch": "1,2", "bwidth": 1000, "nbins": 20, "rtime": 1.0}
    """
    try:
        try:
            ch_str = msg.get("ch", "")
            ch1, ch2 = map(int, ch_str.split(","))
            bwidth = validate_arg("bwidth", int, source=msg, min_val=1000, max_val=10000, required=True)
            nbins = validate_arg("nbins", int, source=msg, min_val=10, max_val=100, required=True)
            rtime = validate_arg("rtime", float, source=msg, min_val=0.1, max_val=5.0, required=True)
        except ValueError as e:
            emit("configured", {"status": 400, "error": str(e)})
            return

        with correlation_lock:
            s = correlation_clients[request.sid]
            s["params"] = {
                "ch": (ch1, ch2),
                "bwidth": bwidth,
                "nbins": nbins,
                "rtime": rtime
            }
            s["version"] += 1
        emit("configured", {"status": 200})
    except Exception as e:
        logger.exception("Error in correlation configure")
        emit("configured", {"status": 400, "error": str(e)})

@socketio.on("disconnect", namespace="/ws/timetagger/correlation")
def corr_disconnect():
    stop_stream(correlation_clients, correlation_lock, request.sid)

# =================================================
# ================= SERVER START ==================
# =================================================

if __name__ == "__main__":
    socketio.run(
        app,
        host="0.0.0.0",
        port=5003,
        debug=False,
        use_reloader=False,
        allow_unsafe_werkzeug=True
    )
