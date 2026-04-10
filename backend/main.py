import os
from dotenv import load_dotenv
load_dotenv()
import base64
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from google import genai
from google.genai import types

app = FastAPI()

# Allow CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not set.")
    try:
        return genai.Client(api_key=api_key)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize Gemini Client: {str(e)}")



class GenerateImageRequest(BaseModel):
    image: str  # base64 data URL
    aspectRatio: str
    apiRatio: str
    layoutInstruction: str

class EditImageRequest(BaseModel):
    image: str  # base64 data URL
    prompt: str

@app.post("/api/generate-image")
async def generate_image(req: GenerateImageRequest):
    try:
        client = get_client()
        
        # Parse base64
        header, encoded = req.image.split(",", 1)
        mime_type = header.split(";")[0].split(":")[1]
        data = base64.b64decode(encoded)
        
        image_part = types.Part.from_bytes(data=data, mime_type=mime_type)
        
        w, h = map(int, req.aspectRatio.split(':'))
        layout_instruction = ""
        if h > w:
            layout_instruction = """
VERTICAL LAYOUT RULE: Since this is a vertical aspect ratio, position the main subject/product at the BOTTOM of the image. 
Text elements in the image should be classified into Headline, Description, Call to Action (CTA), and Period (기간).
Headline and Description MUST be placed at the TOP area of the image and written VERTICALLY (top-to-bottom, vertical writing style). Each Korean character MUST remain UPRIGHT (oriented normally, not rotated). The characters should stack vertically from top to bottom. Do NOT rotate the text line or individual characters by 90 degrees.
Other text elements like Call to Action (CTA) and Period (기간) MUST remain HORIZONTAL (left-to-right, horizontal writing style)."""
        elif w > h:
            layout_instruction = """
HORIZONTAL LAYOUT RULE: Since this is a horizontal aspect ratio, position the main subject/product at the RIGHT side of the image. 
All text elements (Headline, Description, CTA, Period) MUST be placed at the LEFT side of the image and written HORIZONTALLY."""

        prompt = f"""Perform a professional outpainting to expand the image to the {req.aspectRatio} aspect ratio. 
OBJECT PRESERVATION RULE: Every object, subject, device, and element present in the original image MUST be preserved and remain fully visible in the final composition. Do NOT omit, delete, or skip any secondary monitors, circular callouts, smaller devices, or UI elements. If the original has multiple screens, all must be present.
TEXT & LABEL PRESERVATION: All text, product names, labels, fine print, and legal disclaimers from the original image MUST be preserved exactly as they are. This includes model names (e.g., "UltraGear 27G610A"), brand names ("LG UltraGear"), and footer text. Do NOT remove, simplify, translate, or transliterate any text. Keep English words in English (e.g., "LG", "TV") and numbers as numbers (e.g., "10"). Do NOT convert them to Korean equivalents like "엘지", "티비", or "십년". Preserve the exact characters and language of the original text.
NO NEW TEXT: Do NOT add any new text, labels, watermarks, characters, or symbols that were not present in the original image. The extended areas should consist strictly of background elements and seamless extensions of the environment.
NEGATIVE SPACE & MINIMALISM: Maintain the clean, minimalist aesthetic of the original image. Do NOT overfill the frame with unnecessary background details. Preserve the "white space" or "negative space" to ensure the composition remains balanced and uncluttered. The extended areas should feel spacious and airy, not crowded.
NO DUPLICATION RULE: Do NOT duplicate, repeat, or clone the main subject, products, or any objects from the original image. There should be exactly ONE instance of the main subject in the final image. The extended areas must contain ONLY extended background, floor, wall, or environment, without repeating the products.{layout_instruction}
TEXT REPOSITIONING RULE: When moving, rearranging, or changing the layout of text (e.g., making it vertical), you MUST ERASE the original text from its old position and fill that area with a seamless background. Do NOT let the new text overlap with the original text. There should be no ghosting, duplication, or overlapping of text.
Subject Integrity: Strictly preserve the original subjects, brand colors, typography, and logos. Do NOT alter, distort, or modify any of the existing elements. Do NOT duplicate or clone the subjects into the extended areas; the outpainting should ONLY extend the background environment.
Composition & Layout: {req.layoutInstruction} Intelligently reposition existing elements (including all text and labels) to fit the new aspect ratio harmoniously, ensuring everything is fully visible and NOT cut off. The final result should look like a professionally shot photograph with intentional framing and balanced white space."""

        flash_ratios = ["4:1", "8:1", "21:9", "1:4", "1:8"]
        model_name = "gemini-3.1-flash-image-preview" if req.aspectRatio in flash_ratios else "gemini-3-pro-image-preview"

        response = await client.aio.models.generate_content(
            model=model_name,
            contents=[image_part, prompt],
            config=types.GenerateContentConfig(
                image_config=types.ImageConfig(
                    aspect_ratio=req.apiRatio,
                    image_size="1K"
                ),
                response_modalities=["IMAGE"]
            )
        )
        
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            for p in response.candidates[0].content.parts:
                if p.inline_data:
                    out_b64 = base64.b64encode(p.inline_data.data).decode("utf-8")
                    out_mime = p.inline_data.mime_type
                    return {"result": f"data:{out_mime};base64,{out_b64}"}
        
        raise Exception("No image was generated")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/edit-image")
async def edit_image(req: EditImageRequest):
    try:
        client = get_client()
        
        # Parse base64
        header, encoded = req.image.split(",", 1)
        mime_type = header.split(";")[0].split(":")[1]
        data = base64.b64decode(encoded)
        
        image_part = types.Part.from_bytes(data=data, mime_type=mime_type)
        
        prompt = f"""{req.prompt} 
Strictly maintain the overall composition, aspect ratio, and brand identity. 
Preserve all existing text, logos, and product details outside the target area. 
The result must be professional, high-quality, and indistinguishable from a real photograph."""

        response = await client.aio.models.generate_content(
            model='gemini-3-pro-image-preview',
            contents=[image_part, prompt],
            config=types.GenerateContentConfig(
                image_config=types.ImageConfig(
                    image_size="1K"
                ),
                response_modalities=["IMAGE"]
            )
        )
        
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            for p in response.candidates[0].content.parts:
                if p.inline_data:
                    out_b64 = base64.b64encode(p.inline_data.data).decode("utf-8")
                    out_mime = p.inline_data.mime_type
                    return {"result": f"data:{out_mime};base64,{out_b64}"}
        
        raise Exception("No image was generated")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve static files from the "static" directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
