import sys
import os
sys.path.append('/app')
from backend.app.storage.runtime_store import resolve_runtime_backend
print("BACKEND:", resolve_runtime_backend())
