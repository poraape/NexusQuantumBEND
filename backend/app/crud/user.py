from .....backend.app.schemas.user import User
from .....backend.app.core.security import get_password_hash

# Fake user database
fake_users_db = {
    "testuser": {
        "id": 1,
        "username": "testuser",
        "email": "test@example.com",
        "full_name": "Test User",
        "disabled": False,
        "hashed_password": get_password_hash("testpassword")
    }
}

def get_user(username: str) -> User | None:
    if username in fake_users_db:
        user_dict = fake_users_db[username]
        return User(**user_dict)
    return None
