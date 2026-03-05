import os
import uuid
import whisper
import yt_dlp

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
TEMP_MEDIA_DIR = os.path.join(BASE_DIR, "temp_media")

# Create the temp directory if it doesn't exist
os.makedirs(TEMP_MEDIA_DIR, exist_ok=True)

def download_audio_from_video(video_url: str) -> str:
    """Downloads a video from a URL and extracts the audio as an MP3."""
    print(f"Downloading audio from: {video_url}...")
    
    file_id = str(uuid.uuid4())
    out_tmpl = os.path.join(TEMP_MEDIA_DIR, f"{file_id}.%(ext)s")

    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': out_tmpl,
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True  # CRITICAL FIX: Ignores playlists so it doesn't crash!
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])
        return os.path.join(TEMP_MEDIA_DIR, f"{file_id}.mp3")
    except Exception as e:
        raise Exception(f"Video Download Failed: {str(e)}. (Is FFmpeg installed and VS Code restarted?)")

def transcribe_audio(file_path: str) -> str:
    """Uses OpenAI Whisper to turn the audio file into text."""
    print("Transcribing audio with Whisper... (This might take a moment)")
    
    try:
        # We use the "base" model so it runs quickly on your local machine
        model = whisper.load_model("base")
        result = model.transcribe(file_path)
        
        # Clean up the heavy MP3 file after we get the text
        if os.path.exists(file_path):
            os.remove(file_path)
            
        return result["text"]
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise Exception(f"Transcription failed: {str(e)}")