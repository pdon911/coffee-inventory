{ pkgs, ... }: {
  
  # Keep using the stable channel
  channel = "stable-24.05";

  # 1. System Tools
  # We only install the "Runners" here. Libraries (React, Flask) are installed later.
  packages = [
    pkgs.nodejs_20
    pkgs.python311
    pkgs.python311Packages.pip  # Explicitly fixes the "pip not found" error
    pkgs.sqlite
  ];

  # 2. VS Code Extensions
  # Swapped Svelte/Vue for Python & React tools
  idx.extensions = [
    "ms-python.python"
    "esbenp.prettier-vscode"
    "dsznajder.es7-react-js-snippets"
    "RooVeterinaryInc.roo-cline"
    "alexcvzz.vscode-sqlite"
    "rangav.vscode-thunder-client"
  ];

  # 3. Automation Scripts (The Important Part)
  idx.workspace = {
    # Runs ONLY when you create/rebuild the environment
    onCreate = {
      install-dependencies = ''
        # 1. Setup Python Backend
        python -m venv .venv
        source .venv/bin/activate
        pip install -r requirements.txt
        
        # 2. Setup React Frontend
        npm install
      '';
    };
    
    # Runs EVERY time you restart the environment
    onStart = {
      # Automatically activates the virtual environment in your terminal
      # Creates it if missing (e.g. if onCreate didn't run)
      activate-venv = "test -d .venv || (python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt); source .venv/bin/activate";
    };
  };

  # 4. Preview Configuration
  # This tells IDX how to show your app in the sidebar phone simulator
  idx.previews = {
    previews = {
      web = {
        command = [
          "/bin/bash"
          "-c"
          "source .venv/bin/activate && PORT=8080 python app.py & npm run dev -- --port $PORT --host 0.0.0.0"
        ];
        manager = "web";
      };
    };
  };
}