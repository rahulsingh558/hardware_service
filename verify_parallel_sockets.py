
import socketio
import time
import threading
import queue

# Server URL
URL = "http://localhost:5003"

def run_client(namespace, config, event_name, result_queue, duration=5):
    sio = socketio.Client()
    received_events = []
    
    @sio.on('connect', namespace=namespace)
    def on_connect():
        print(f"[{namespace}] Connected")
        sio.emit('configure', config, namespace=namespace)

    @sio.on('configured', namespace=namespace)
    def on_configured(data):
        print(f"[{namespace}] Configured: {data}")

    @sio.on(event_name, namespace=namespace)
    def on_data(data):
        print(f"[{namespace}] Data received at {time.time()}")
        received_events.append(time.time())

    try:
        sio.connect(URL, namespaces=[namespace])
        time.sleep(duration)
        sio.disconnect()
    except Exception as e:
        print(f"[{namespace}] Error: {e}")
    finally:
        result_queue.put((namespace, received_events))

def verify_parallel():
    q = queue.Queue()
    
    # Client 1: Countrate (1s window)
    t1 = threading.Thread(target=run_client, args=(
        "/ws/timetagger/countrate",
        {"ch": "1,2", "rtime": 1.0},
        "countrate",
        q,
        5 # Run for 5 seconds
    ))

    # Client 2: Correlation (1.5s window) - different window to avoid syncing by chance
    t2 = threading.Thread(target=run_client, args=(
        "/ws/timetagger/correlation", 
        {"ch": "1,2", "bwidth": 1000, "nbins": 100, "rtime": 1.5},
        "correlation",
        q,
        5
    ))

    start_time = time.time()
    t1.start()
    t2.start()
    
    t1.join()
    t2.join()
    
    results = {}
    while not q.empty():
        ns, events = q.get()
        results[ns] = events

    print("\n--- Results ---")
    for ns, events in results.items():
        print(f"{ns}: {len(events)} events received")
        print(f"Timestamps: {events}")

    # Analysis
    # If sequential, we expect Client 1 to block Client 2 or vice versa.
    # Total time is 5s. 
    # Client 1 (1s integ) -> should get ~3-4 events.
    # Client 2 (1.5s integ) -> should get ~2-3 events.
    # If sequential, total processing time for 1 event each would be 2.5s.
    # They should be receiving data roughly at the same time intervals, showing overlap.
    
    if len(results.get("/ws/timetagger/countrate", [])) >= 3 and \
       len(results.get("/ws/timetagger/correlation", [])) >= 2:
        print("\nSUCCESS: Both clients received expected number of events in parallel.")
    else:
        print("\nFAILURE: Did not receive expected events. Potential serialization issue.")

if __name__ == "__main__":
    verify_parallel()
