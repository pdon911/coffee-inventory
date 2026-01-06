import subprocess
import threading
import os
import sys
import time

def run_backend():
    print("Starting Flask backend on port 8080...")
    # Use sys.executable to ensure we use the same python interpreter
    env = os.environ.copy()
    env["FLASK_DEBUG"] = "1"
    subprocess.run([sys.executable, "app.py"], env=env)

def run_frontend():
    print("Starting Vite frontend on port 3000...")
    # Using cmd /c on Windows to avoid execution policy issues with npm
    shell = True if os.name == 'nt' else False
    cmd = "npm run dev"
    if os.name == 'nt':
        cmd = "cmd /c npm run dev"
    subprocess.run(cmd, shell=shell)

if __name__ == "__main__":
    # Check for node_modules
    if not os.path.exists("node_modules"):
        print("node_modules not found. Installing frontend dependencies...")
        subprocess.run("cmd /c npm install" if os.name == 'nt' else "npm install", shell=True)

    # Check for .env file
    if not os.path.exists(".env"):
        print("Warning: .env file not found. API calls may fail.")
        print("Please copy .env.example to .env and fill in your credentials.")
    
    # Start backend thread
    backend_thread = threading.Thread(target=run_backend, daemon=True)
    backend_thread.start()

    # Give backend a moment to start
    time.sleep(2)

    # Start frontend (this will block until interrupted)
    try:
        run_frontend()
    except KeyboardInterrupt:
        print("\nShutting down...")
