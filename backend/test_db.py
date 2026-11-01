from sqlalchemy import text

from database import engine

try:
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
        print("Database connection successful!")
        print("Engine:", engine.url.render_as_string(hide_password=True))
except Exception as error:
    print("Database connection failed.")
    print(type(error).__name__, error)
