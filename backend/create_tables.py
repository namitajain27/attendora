"""Create the database tables.

    python create_tables.py            # create missing tables
    python create_tables.py --reset    # DROP everything and recreate (deletes data!)
"""
import sys

from database import Base, engine
import models  # noqa: F401  (registers the tables)

if "--reset" in sys.argv:
    answer = input("This will DELETE all students and attendance. Type YES to continue: ")
    if answer.strip() != "YES":
        print("Cancelled.")
        sys.exit(0)
    Base.metadata.drop_all(bind=engine)

Base.metadata.create_all(bind=engine)
print("Database tables created successfully!")
