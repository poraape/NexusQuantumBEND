
import chardet
from fastapi import APIRouter, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
import pandas as pd
import io

router = APIRouter()

def read_file_content(file: UploadFile):
    """
    Reads the content of a file, automatically detecting its encoding.
    """
    content_bytes = file.read()
    
    # Reset file pointer to be able to read it again if needed
    file.seek(0)

    # Detect encoding
    detected_encoding = chardet.detect(content_bytes)
    encoding = detected_encoding['encoding'] if detected_encoding['encoding'] else 'utf-8'

    # List of fallback encodings
    fallback_encodings = ['utf-8', 'iso-8859-1', 'windows-1252']
    
    if encoding not in fallback_encodings:
        fallback_encodings.insert(0, encoding)

    decoded_content = None
    used_encoding = None

    for enc in fallback_encodings:
        try:
            decoded_content = content_bytes.decode(enc)
            used_encoding = enc
            break
        except (UnicodeDecodeError, TypeError):
            continue

    if decoded_content is None:
        raise HTTPException(status_code=400, detail="Could not decode the file with any of the supported encodings.")

    return decoded_content, used_encoding

@router.post("/upload/")
async def upload_file(file: UploadFile = File(...)):
    """
    Uploads a file, detects its encoding, and returns its content as JSON.
    """
    try:
        content, encoding = read_file_content(file)
        
        # Assuming CSV for now, as it's a common format for data analysis
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.StringIO(content))
            data = df.to_dict(orient='records')
        else:
            # For other file types, return raw content
            data = content.splitlines()

        return JSONResponse(content={
            "filename": file.filename,
            "detected_encoding": encoding,
            "data": data
        })
    except HTTPException as e:
        return JSONResponse(content={"error": e.detail}, status_code=e.status_code)
    except Exception as e:
        return JSONResponse(content={"error": f"An unexpected error occurred: {str(e)}"}, status_code=500)
