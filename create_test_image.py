from PIL import Image

# Create a blank white image
img = Image.new('RGB', (200, 200), 'white')
img.save('tests/fixtures/test-image.jpg')
