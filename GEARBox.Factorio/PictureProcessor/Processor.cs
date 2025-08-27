using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Processing.Processors.Transforms;

namespace GEARBox.Factorio.PictureProcessor {
    
    /// <summary>
    /// Image mutation methods for the picture processor.
    /// </summary>
    public static class Processor {
        
        /// <summary>
        /// Trims the whitespace around an image.
        /// </summary>
        /// <param name="image">The image to trim.</param>
        public static void TrimWhitespace(Image<Rgba32> image) {
            const byte threshold = 0;
            int minX = image.Width;
            int minY = image.Height;
            int maxX = -1;
            int maxY = -1;
            for (int x = 0; x < image.Width; x++) {
                for (int y = 0; y < image.Height; y++) {
                    Rgba32 pixel = image[x, y];
                    if (pixel.A > threshold) {
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x > maxX) maxX = x;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (maxX < 0 || maxY < 0) {
                throw new InvalidOperationException("Cannot process an image which is entirely transparent!");
            }
            Rectangle rect = new Rectangle(minX, minY, maxX - minX + 1, maxY - minY + 1);
            image.Mutate(ctx => ctx.Crop(rect));
        }
        
        /// <summary>
        /// Resizes an image to fit within a target size while maintaining aspect ratio.
        /// The image is scaled by the given scale factor after resizing.
        /// </summary>
        /// <remarks>
        /// Scaled using a Bicubic resampler for better downsizing quality.
        /// </remarks>
        /// <param name="image">The image to resize.</param>
        /// <param name="targetSize">The target size (width or height) to fit within.</param>
        /// <param name="scale">The scale factor to apply after resizing.</param>
        public static void ResizeWithAspect(Image<Rgba32> image, double targetSize, double scale = 1.0) {
            double newWidth;
            double newHeight;
            if (image.Width > image.Height) {
                newWidth = targetSize;
                newHeight = image.Height * (targetSize / image.Width);
            } else {
                newHeight = targetSize;
                newWidth = image.Width * (targetSize / image.Height);
            }
            newWidth = newWidth * scale;
            newHeight = newHeight * scale;
            image.Mutate(ctx => ctx.Resize((int) Math.Round(newWidth), (int) Math.Round(newHeight), new BicubicResampler()));
        }
        
        /// <summary>
        /// Prints suggested alignment and offset values for an image and its shadow based on given alignment.
        /// </summary>
        /// <param name="image">The main image.</param>
        /// <param name="shadowImage">The shadow image, if any.</param>
        /// <param name="alignment">The alignment tuple (x, y) where each value is between 0 and 1.</param>
        public static void SuggestAlignment(Image<Rgba32> image, Image<Rgba32>? shadowImage, (double X, double Y) alignment) {
            // Suggest alignment values
            Console.WriteLine($"Using alignment: ({alignment.X:F1}, {alignment.Y:F1})");
            (double X, double Y) offset = ProcessAlignment(image, alignment);
            Console.WriteLine($"Suggested offset for image alignment: {offset}");
            if (shadowImage != null) {
                (double X, double Y) shadowOffset = ProcessShadowAlignment(image, offset, shadowImage);
                Console.WriteLine($"Suggested offset for shadow alignment: {shadowOffset}");
            }
        }
        
        /// <summary>
        /// Processes the alignment tuple into pixel values based on Factorio constants.
        /// </summary>
        /// <param name="image">The image to be processed.</param>
        /// <param name="alignment">The alignment tuple (x, y) where each value is between 0 and 1.</param>
        /// <returns>A tuple containing the processed pixel alignment values (pX, pY).</returns>
        private static (double X, double Y) ProcessAlignment(Image<Rgba32> image, (double X, double Y) alignment) {
            const byte tileSize = 64;
            double offsetX = 0.5 * (alignment.X - 0.5) * (tileSize - image.Width);
            double offsetY = 0.5 * (alignment.Y - 0.5) * (tileSize - image.Height);
            return (offsetX, offsetY);
        }
        
        /// <summary>
        /// Processes a shadow alignment tuple into pixel values based on Factorio constants.
        /// </summary>
        /// <remarks>
        /// This method essentially aligns the shadow image to the bottom left,
        /// and then applies the appropriate offsets to move the shadow directly
        /// underneath the existing image. It then adds the existing image's offset
        /// to directly link the positioning of each together.
        /// </remarks>
        /// <param name="image">The image to be processed.</param>
        /// <param name="imageOffset">The offset of the main image.</param>
        /// <param name="shadowImage">The shadow image to be processed.</param>
        /// <returns>A tuple containing the processed pixel alignment values (pX, pY) for the shadow.</returns>
        private static (double X, double Y) ProcessShadowAlignment(Image<Rgba32> image, (double X, double Y) imageOffset, Image<Rgba32> shadowImage) {
            const int tileSize = 64;
            const double aestheticPadding = 1; // Move down just a bit for aesthetics
            (double offsetX, double offsetY) = ProcessAlignment(shadowImage, (0, 1)); // Bottom-left alignment
            
            // Move the image to the right by half the difference between the tile size and the image width
            // This ensures the shadow is always directly underneath the image
            offsetX += Math.Round(((tileSize / 2.0) - (image.Width / 2.0)) / 2.0, 3);
            
            // Small nudge to compensate rendering oddities
            offsetX += image.Width * 0.04;
            
            // Pull the shadow down by one image height (div 2. to compensate for Factorio's center alignment)
            offsetY += shadowImage.Height / 2.0;
            
            // Apply the existing image offset
            offsetX += imageOffset.X;
            offsetY += imageOffset.Y * 2.0;
            
            // Apply aesthetic padding
            offsetY += aestheticPadding;
            
            return (offsetX, offsetY);
        }
        
    }
    
}