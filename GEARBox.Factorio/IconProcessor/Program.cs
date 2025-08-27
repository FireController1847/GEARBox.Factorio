using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Processing.Processors.Transforms;
using System.CommandLine;

namespace GEARBox.Factorio.IconProcessor {
    
    /// <summary>
    /// The entry point for the Icon Processor application.
    /// </summary>
    public static class Program {
        
        /// <summary>
        /// The root command for the application.
        /// </summary>
        private static RootCommand _root;
        
        /// <summary>
        /// An argument representing the input texture file.
        /// </summary>
        // ReSharper disable once InconsistentNaming
        private static Argument<FileInfo> _arg_texture;
        
        /// <summary>
        /// Static constructor for <see cref="Program"/>.
        /// </summary>
        static Program() {
            _root = null!;
            _arg_texture = null!;
        }
        
        /// <summary>
        /// The main program entry point.
        /// </summary>
        /// <param name="args">Arguments passed to the program by the operating system.</param>
        /// <returns>An exit code, where zero indicates success and any non-zero value indicates an error.</returns>
        public static async Task<int> Main(string[] args) {
            ConfigureOptions(args);
            ConfigureCommands(args);
            return await _root.Parse(args.Length == 0 ? ["-h"] : args).InvokeAsync();
        }
        
        /// <summary>
        /// Configures the command-line options for the application.
        /// </summary>
        private static void ConfigureOptions(string[] args) {
            _arg_texture = new("texture") {
                Description = "The base texture file to be converted into an icon set.",
                Arity = ArgumentArity.ExactlyOne
            };
        }
        
        /// <summary>
        /// Configures the commands for the application.
        /// </summary>
        private static void ConfigureCommands(string[] args) {
            _root = new() {
                Description = "A utility for processing icons for Factorio mods."
            };
            _root.Arguments.Add(_arg_texture);
            _root.SetAction(Process);
        }
        
        /// <summary>
        /// Performs the processing of the icon image based on the provided parse result.
        /// </summary>
        /// <param name="pr">The parse result containing the command-line arguments.</param>
        private static async Task Process(ParseResult pr) {
            // Pull the texture and prepare the image for processing.
            FileInfo texture = pr.GetValue(_arg_texture)!;
            Image<Rgba32> image = await Image.LoadAsync<Rgba32>(texture.FullName);
            Console.WriteLine($"Loaded image: {texture.FullName} ({image.Width}x{image.Height})");
            
            // Trim the whitespace around the image.
            Processor.TrimWhitespace(image);
            Console.WriteLine($"Trimmed whitespace, cropped image to: {image.Width}x{image.Height}");
            
            // Check if the resulting trim is square (allowing a tolerance of 10 pixels).
            const int tolerance = 10;
            if (Math.Abs(image.Width - image.Height) > tolerance) {
                Console.WriteLine($"\e[33mWarning: The trimmed image is not square (difference: {Math.Abs(image.Width - image.Height)}px). The icon may not appear as expected.\e[0m");
            }
            
            // Create the icon base
            Image<Rgba32> icon = new(120, 64);
            
            // Process image resolutions (64x64, 32x32, 16x16, 8x8)
            const int shadowBlurRadius = 2; // Padding for shadow blur
            int[] resolutions = [64, 32, 16, 8];
            int[] positions = [0, 64, 96, 112];
            Image<Rgba32> clone = null!;
            for (int i = 0; i < resolutions.Length; i++) {
                int resolution = resolutions[i];
                int pad = Math.Min(shadowBlurRadius, resolution / 4); // Prevent negative or excessive padding
                int targetSize = resolution - 2 * pad;
                clone?.Dispose();
                clone = image.Clone();
                Image<Rgba32> newClone = Processor.ResizeWithAspect(clone, targetSize, anchor: (0.5, 0.5));
                clone.Dispose();
                clone = newClone;
                Console.WriteLine($"Resized image to: {clone.Width}x{clone.Height} with padding {pad}");
                // Center the clone within the padded area
                int drawX = positions[i] + pad;
                int drawY = pad;
                icon.Mutate(ctx => ctx.DrawImage(clone, new Point(drawX, drawY), 1f));
                Console.WriteLine($"Generated icon layer: {resolution}x{resolution} at position {drawX},{drawY}");
            }
            clone?.Dispose();
            
            // Apply a drop shadow to the icon
            Processor.ApplyDropShadow(icon, 0, 0, shadowBlurRadius, new(0, 0, 0, 116));
            
            // Save the output icon
            string outputPath = (texture.DirectoryName ?? ".") + '/' + Path.GetFileNameWithoutExtension(texture.Name) + "-processed.png";
            await icon.SaveAsPngAsync(outputPath);
        }
        
    }
    
}