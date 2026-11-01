"""Small helpers around the `face_recognition` library."""
import io
import json
from typing import List, Optional, Tuple

import face_recognition
import numpy as np
from PIL import Image, ImageOps


class FaceError(ValueError):
    """Raised when an image cannot be used for face recognition."""


def read_image(data: bytes, max_width: int = 800) -> Image.Image:
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        raise FaceError("Invalid image file. Please upload a JPG, PNG or WEBP photo.")

    if img.width > max_width:
        ratio = max_width / img.width
        img = img.resize((max_width, int(img.height * ratio)))
    return img


def get_encodings(img: Image.Image) -> List[np.ndarray]:
    arr = np.array(img)
    locations = face_recognition.face_locations(arr)
    return face_recognition.face_encodings(arr, locations)


def encode_single_face(data: bytes) -> Tuple[Image.Image, List[float]]:
    """For enrollment: the photo must contain exactly one clear face."""
    img = read_image(data, max_width=1000)
    encodings = get_encodings(img)
    if len(encodings) == 0:
        raise FaceError("No face found in the photo. Use good lighting and face the camera.")
    if len(encodings) > 1:
        raise FaceError("More than one face found. Please use a photo with only one person.")
    return img, encodings[0].tolist()


def jpeg_bytes(img: Image.Image) -> bytes:
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=90)
    return buffer.getvalue()


def dumps(encoding: List[float]) -> str:
    return json.dumps(encoding)


def loads(value: str) -> np.ndarray:
    return np.array(json.loads(value))


def best_match(
    known: List[np.ndarray], probe: np.ndarray, tolerance: float
) -> Tuple[Optional[int], float]:
    """Return (index_of_best_match or None, distance)."""
    if not known:
        return None, 1.0
    distances = face_recognition.face_distance(known, probe)
    index = int(np.argmin(distances))
    distance = float(distances[index])
    return (index if distance <= tolerance else None), distance
