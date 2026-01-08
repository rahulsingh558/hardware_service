import websocket
import sys

try:
    # Note: socket.io handshake usually requires specific EIO param.
    # ws://localhost:5003/socket.io/?EIO=4&transport=websocket
    ws = websocket.create_connection("ws://localhost:5003/socket.io/?EIO=4&transport=websocket")
    print("Connection successful")
    result = ws.recv()
    print(f"Received: {result}")
    ws.close()
except Exception as e:
    print(f"Connection failed: {e}")
