import os
from PIL import Image

# Define the directory containing the original PNG images
# Update this path if you place your original images elsewhere
input_dir = '/home/user/PhD_Code/dome-ml-osai-ui/src/assets/img_originals'

# Define the directory where the WebP images will be saved
output_dir = '/home/user/PhD_Code/dome-ml-osai-ui/src/assets/img'

# Create the output directory if it doesn't exist
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

# Loop through all files in the input directory
for filename in os.listdir(input_dir):
    if filename.endswith('.png'):
        # Construct the full file paths
        input_path = os.path.join(input_dir, filename)
        # Change the file extension from .png to .webp
        output_filename = os.path.splitext(filename)[0] + '.webp'
        output_path = os.path.join(output_dir, output_filename)

        try:
            # Open the PNG image
            with Image.open(input_path) as img:
                # Save the image in WebP format
                # The 'quality' parameter can be adjusted (0-100)
                img.save(output_path, 'webp', quality=85)
            print(f"Converted '{filename}' to '{output_filename}'")
        except Exception as e:
            print(f"Could not convert {filename}: {e}")

print("\nConversion complete.")
