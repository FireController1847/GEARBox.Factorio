using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Processing.Processors.Transforms;

namespace GEARBox.Factorio.IconProcessor {
    
    /// <summary>
    /// Image mutation methods for the icon processor.
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
        /// Resizes an image to fit within a target size while maintaining aspect ratio, then pads to square using anchor.
        /// The image is scaled by the given scale factor after resizing.
        /// </summary>
        /// <remarks>
        /// Scaled using a Bicubic resampler for better downsizing quality.
        /// </remarks>
        /// <param name="image">The image to resize.</param>
        /// <param name="targetSize">The target size (width or height) to fit within.</param>
        /// <param name="scale">The scale factor to apply after resizing.</param>
        /// <param name="anchor">Tuple (X, Y) where 0.0 = left/top, 0.5 = center, 1.0 = right/bottom.</param>
        public static Image<Rgba32> ResizeWithAspect(Image<Rgba32> image, double targetSize, double scale = 1.0, (double X, double Y)? anchor = null) {
            double newWidth;
            double newHeight;
            if (image.Width > image.Height) {
                newWidth = targetSize;
                newHeight = image.Height * (targetSize / image.Width);
            } else {
                newHeight = targetSize;
                newWidth = image.Width * (targetSize / image.Height);
            }
            newWidth *= scale;
            newHeight *= scale;
            image.Mutate(ctx => ctx.Resize((int)Math.Round(newWidth), (int)Math.Round(newHeight), new BicubicResampler()));

            // Padding to square canvas
            int canvasSize = (int)Math.Round(targetSize * scale);
            anchor ??= (0.5, 0.5);
            int padLeft = (int)Math.Round((canvasSize - image.Width) * anchor.Value.X);
            int padTop = (int)Math.Round((canvasSize - image.Height) * anchor.Value.Y);

            // Create new canvas and draw image at offset
            Image<Rgba32> padded = new(canvasSize, canvasSize);
            padded.Mutate(ctx => ctx.DrawImage(image, new Point(padLeft, padTop), 1f));
            return padded;
        }
        
        /// <summary>
        /// Applies a configurable drop-shadow to the input image using pixel modifications, preserving image size.
        /// </summary>
        /// <param name="image">The image to apply the shadow to. Modified in-place.</param>
        /// <param name="offsetX">Horizontal offset of the shadow.</param>
        /// <param name="offsetY">Vertical offset of the shadow.</param>
        /// <param name="blurRadius">Radius of the Gaussian blur for the shadow.</param>
        /// <param name="shadowColor">Color of the shadow (including alpha for opacity).</param>
        public static void ApplyDropShadow(Image<Rgba32> image, int offsetX, int offsetY, int blurRadius, Rgba32 shadowColor) {
            int width = image.Width;
            int height = image.Height;
            using var shadowLayer = new Image<Rgba32>(width, height);

            // Draw shadow: for each non-transparent pixel, draw shadowColor at offset position
            for (int x = 0; x < width; x++) {
                for (int y = 0; y < height; y++) {
                    byte alpha = image[x, y].A;
                    if (alpha > 0) {
                        int sx = x + offsetX;
                        int sy = y + offsetY;
                        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
                            var col = shadowColor;
                            col.A = (byte)(shadowColor.A * (alpha / 255.0));
                            // Alpha blend with existing shadow pixel
                            var existing = shadowLayer[sx, sy];
                            float srcA = col.A / 255f;
                            float dstA = existing.A / 255f;
                            float outA = srcA + dstA * (1 - srcA);
                            if (outA > 0) {
                                shadowLayer[sx, sy] = new Rgba32(
                                    (byte)((col.R * srcA + existing.R * dstA * (1 - srcA)) / outA),
                                    (byte)((col.G * srcA + existing.G * dstA * (1 - srcA)) / outA),
                                    (byte)((col.B * srcA + existing.B * dstA * (1 - srcA)) / outA),
                                    (byte)(outA * 255)
                                );
                            }
                        }
                    }
                }
            }
            // Only blur if blurRadius > 0
            if (blurRadius > 0) {
                shadowLayer.Mutate(ctx => ctx.GaussianBlur(blurRadius));
            }

            // Composite original image over shadow
            shadowLayer.Mutate(ctx => ctx.DrawImage(image, new Point(0, 0), 1f));

            // Copy result back to input image
            for (int x = 0; x < width; x++) {
                for (int y = 0; y < height; y++) {
                    image[x, y] = shadowLayer[x, y];
                }
            }
        }
    }
}
