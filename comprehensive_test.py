
import requests
import socketio
import threading
import time
import json
import logging
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:5003"
LOG_FILE = "test_results.txt"

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, mode='w'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("Tester")

def log_section(title):
    logger.info("\n" + "="*60)
    logger.info(f"  {title}")
    logger.info("="*60)

def test_rest_endpoint(method, endpoint, params=None, description=""):
    url = f"{BASE_URL}{endpoint}"
    logger.info(f"REST TEST [{description}]")
    logger.info(f"Request: {method} {url} Params={params}")
    try:
        start_time = time.time()
        if method == "GET":
            response = requests.get(url, params=params)
        elif method == "POST":
            response = requests.post(url, json=params)
        duration = time.time() - start_time
        
        logger.info(f"Response Status: {response.status_code}")
        logger.info(f"Response Body: {response.text}")
        logger.info(f"Duration: {duration:.3f}s")
        # Check standard error format
        if response.status_code == 200:
             try:
                 data = response.json()
                 if data.get("status") == 400:
                      logger.info("-> Correctly handled soft error (status: 400)")
                 elif data.get("status") == 200:
                      logger.info("-> Success (status: 200)")
             except:
                 pass
        return response
    except Exception as e:
        logger.error(f"Request failed: {e}")
        return None

def run_rest_suite():
    log_section("STARTING REST API TESTS")

    # 1. Countrate Tests
    test_rest_endpoint("GET", "/timetagger/countrate", {"ch": "1,2", "rtime": 0.2}, "Valid Countrate (0.2s)")
    test_rest_endpoint("GET", "/timetagger/countrate", {"ch": "1", "rtime": 0.05}, "Invalid Countrate (Too small: 0.05s)")
    test_rest_endpoint("GET", "/timetagger/countrate", {"ch": "1", "rtime": 6.0}, "Invalid Countrate (Too large: 6.0s)")

    # 2. Coincidence Tests
    test_rest_endpoint("GET", "/timetagger/coincidence", {"groups": "1,2", "cwin": 2000, "rtime": 0.5}, "Valid Coincidence")
    test_rest_endpoint("GET", "/timetagger/coincidence", {"groups": "1,2", "cwin": 100, "rtime": 0.5}, "Invalid Coincidence (Window too small)")

    # 3. Correlation Tests
    test_rest_endpoint("GET", "/timetagger/correlation", {"ch": "1,2", "bwidth": 5000, "nbins": 50, "rtime": 0.5}, "Valid Correlation")
    
    # 4. Laser Tests
    test_rest_endpoint("GET", "/laser/control", {"switch": 1, "power": 2.0}, "Laser ON Valid")
    test_rest_endpoint("GET", "/laser/control", {"switch": 1, "power": 6.0}, "Laser ON Invalid Power (>5.0)")
    test_rest_endpoint("GET", "/laser/control", {"switch": 0, "power": 2.0}, "Laser OFF with Power Param (Should fail)")
    test_rest_endpoint("GET", "/laser/control", {"switch": 0}, "Laser OFF Valid")


def socket_client_worker(client_id, namespace, initial_config, update_config_valid, update_config_invalid):
    sio = socketio.Client()
    results = []
    
    @sio.event(namespace=namespace)
    def connect():
        logger.info(f"[Client {client_id}] Connected to {namespace}")

    @sio.event(namespace=namespace)
    def configured(data):
        logger.info(f"[Client {client_id}] Configured response: {data}")

    # Specific event handlers
    @sio.on("countrate", namespace=namespace)
    def on_countrate(data):
        logger.info(f"[Client {client_id}] Received Data: {data.keys()} rtime={data.get('rtime')}")

    @sio.on("coincidence", namespace=namespace)
    def on_coincidence(data):
        logger.info(f"[Client {client_id}] Received Coincidence Data")

    @sio.on("correlation", namespace=namespace)
    def on_correlation(data):
         logger.info(f"[Client {client_id}] Received Correlation Data")

    try:
        url = f"{BASE_URL}{namespace}"
        logger.info(f"[Client {client_id}] Connecting...")
        sio.connect(BASE_URL, namespaces=[namespace], wait=True)
        
        # 1. Initial Valid Configuration
        logger.info(f"[Client {client_id}] Sending Initial Config: {initial_config}")
        sio.emit("configure", initial_config, namespace=namespace)
        time.sleep(2) # Wait for some data

        # 2. Real-time Update (Valid)
        if update_config_valid:
            logger.info(f"[Client {client_id}] Sending Valid Update: {update_config_valid}")
            sio.emit("configure", update_config_valid, namespace=namespace)
            time.sleep(2)

        # 3. Real-time Update (Invalid)
        if update_config_invalid:
            logger.info(f"[Client {client_id}] Sending Invalid Update: {update_config_invalid}")
            sio.emit("configure", update_config_invalid, namespace=namespace)
            time.sleep(1) # Should receive error response

        sio.disconnect()
        logger.info(f"[Client {client_id}] Disconnected")
    except Exception as e:
        logger.error(f"[Client {client_id}] Error: {e}")

def run_socket_suite():
    log_section("STARTING SOCKET.IO MULTI-CLIENT TESTS")
    
    threads = []

    # Client 1: Countrate
    t1 = threading.Thread(target=socket_client_worker, args=(
        "CountrateUser", 
        "/ws/timetagger/countrate",
        {"ch": "1,2", "rtime": 0.2},
        {"ch": "3,4", "rtime": 0.5},
        {"ch": "1", "rtime": 10.0} # Invalid rtime
    ))
    threads.append(t1)

    # Client 2: Coincidence
    t2 = threading.Thread(target=socket_client_worker, args=(
        "CoincidenceUser",
        "/ws/timetagger/coincidence",
        {"groups": "1,2", "cwin": 1000, "rtime": 0.5},
        {"groups": "3,4", "cwin": 2000, "rtime": 1.0},
        {"groups": "1,2", "cwin": 50, "rtime": 1.0} # Invalid cwin
    ))
    threads.append(t2)

    # Client 3: Correlation (just one valid run)
    t3 = threading.Thread(target=socket_client_worker, args=(
        "CorrelationUser",
        "/ws/timetagger/correlation",
        {"ch": "1,2", "bwidth": 1000, "nbins": 50, "rtime": 0.5},
        None,
        None
    ))
    threads.append(t3)

    logger.info("Starting 3 concurrent socket clients...")
    for t in threads:
        t.start()
    
    for t in threads:
        t.join()
    logger.info("All socket clients finished.")

if __name__ == "__main__":
    logger.info(f"Test Suite Started at {datetime.now()}")
    
    # Run REST Tests
    run_rest_suite()
    
    # Run Socket Tests
    run_socket_suite()
    
    logger.info(f"Test Suite Completed at {datetime.now()}")
    print(f"\nTests completed. Results saved to {LOG_FILE}")
