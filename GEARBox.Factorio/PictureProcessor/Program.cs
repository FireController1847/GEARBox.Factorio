using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using SixLabors.ImageSharp.Processing;
using SixLabors.ImageSharp.Processing.Processors.Transforms;
using System.CommandLine;
using System.CommandLine.Parsing;
using System.Diagnostics;

namespace GEARBox.Factorio.PictureProcessor {
    
    /// <summary>
    /// The entry point for the Picture Processor application.
    /// </summary>
    public static class Program {
        
        /// <summary>
        /// The root command for the application.
        /// </summary>
        private static RootCommand _root;
        
        /// <summary>
        /// An option accepting one or more image files to be processed.
        /// </summary>
        // ReSharper disable once InconsistentNaming
        private static Option<FileInfo[]> _opt_textures;
        
        /// <summary>
        /// An option accepting a shadow image file to be processed.
        /// </summary>
        // ReSharper disable once InconsistentNaming
        private static Option<FileInfo> _opt_shadow;
        
        /// <summary>
        /// An option specifying the number of variants in a sprite sheet.
        /// </summary>
        // ReSharper disable once InconsistentNaming
        private static Option<int> _opt_variants;
        
        /// <summary>
        /// An option specifying the scale factor for resizing images.
        /// </summary>
        // ReSharper disable once InconsistentNaming
        private static Option<double> _opt_scale;
        
        /// <summary>
        /// An option specifying the alignment for image placement.
        /// </summary>
        // ReSharper disable once InconsistentNaming
        private static Option<(double X, double Y)> _opt_alignment;
        
        /// <summary>
        /// Static constructor for <see cref="Program"/>.
        /// </summary>
        static Program() {
            _root = null!;
            _opt_textures = null!;
            _opt_shadow = null!;
            _opt_variants = null!;
            _opt_scale = null!;
            _opt_alignment = null!;
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
            _opt_textures = new("--textures") {
                Description = "One or more texture files to process.",
                AllowMultipleArgumentsPerToken = true,
                Required = true
            };
            _opt_shadow = new("--shadow") {
                Description = "A shadow image file to process.",
                AllowMultipleArgumentsPerToken = true,
                Required = false,
                Arity = ArgumentArity.ZeroOrOne
            };
            _opt_variants = new("--variants") {
                Description = "The number of variants in a sprite sheet.",
                DefaultValueFactory = _ => 1,
                Required = false
            };
            _opt_scale = new("--scale") {
                Description = "Scale factor for resizing images.",
                DefaultValueFactory = _ => 1.0,
                Required = false
            };
            _opt_alignment = new("--alignment") {
                Description = "Alignment for image placement.",
                DefaultValueFactory = _ => (0, 0),
                CustomParser = ar => {
                    Token? token = ar.Tokens.SingleOrDefault();
                    return token == null ? (0, 0) : ProcessAlignment(token.Value);
                },
                Required = false
            };
        }
        
        /// <summary>
        /// Configures the commands for the application.
        /// </summary>
        private static void ConfigureCommands(string[] args) {
            _root = new() {
                Description = "A utility for processing pictures for Factorio mods."
            };
            _root.Options.Add(_opt_textures);
            _root.Options.Add(_opt_shadow);
            _root.Options.Add(_opt_variants);
            _root.Options.Add(_opt_scale);
            _root.Options.Add(_opt_alignment);
            _root.Validators.Add(cr => {
                FileInfo[]? textures = cr.GetValue(_opt_textures);
                int variants = cr.GetValue(_opt_variants);
                if (variants > 1 && (textures is null || textures.Length > 1)) {
                    cr.AddError("--textures must contain exactly one value when --variants is greater than 1.");
                }
            });
            _root.SetAction(Process);
        }
        
        /// <summary>
        /// Attempts to parse and validate an alignment value.
        /// </summary>
        /// <param name="alignment">The alignment value as a string.</param>
        /// <returns>The parsed alignment value as a double.</returns>
        /// <exception cref="ArgumentOutOfRangeException"></exception>
        private static (double X, double Y) ProcessAlignment(string alignment) {
            if (string.IsNullOrEmpty(alignment)) throw new ArgumentNullException(nameof(alignment), "Alignment string cannot be null or empty.");
            alignment = alignment.Trim().ToLower().Replace("-", "").Replace("_", "");
            if (alignment.Contains("center") || alignment.Contains("middle")) {
                if (alignment.Contains("top")) return (0.5, 0);
                if (alignment.Contains("left")) return (0, 0.5);
                if (alignment.Contains("bottom")) return (0.5, 1);
                if (alignment.Contains("right")) return (1, 0.5);
                return (0.5, 0.5);
            }
            if (alignment.Contains("left")) {
                if (alignment.Contains("top")) return (0, 0);
                if (alignment.Contains("bottom")) return (0, 1);
                return (0, 0.5);
            }
            if (alignment.Contains("right")) {
                if (alignment.Contains("top")) return (1, 0);
                if (alignment.Contains("bottom")) return (1, 1);
                return (1, 0.5);
            }
            if (alignment.Contains("top")) {
                return (0.5, 0);
            }
            if (alignment.Contains("bottom")) {
                return (0.5, 1);
            }
            Debug.WriteLine("Warning: Unrecognized alignment value. Defaulting to (0, 0).");
            return (0, 0);
        }
        
        /// <summary>
        /// Performs the processing of the images based on the provided parse result.
        /// </summary>
        /// <param name="pr">The parse result containing the command-line arguments.</param>
        private static async Task Process(ParseResult pr) {
            // Pull options from the parse result
            List<FileInfo> textures = new(pr.GetValue(_opt_textures)!);
            FileInfo? shadow;
            OptionResult? shadowOption = pr.GetResult(_opt_shadow);
            shadow = shadowOption != null ? pr.GetValue(_opt_shadow) : null;
            int variants = pr.GetValue(_opt_variants);
            double scale = pr.GetValue(_opt_scale);
            (double X, double Y) alignment = pr.GetValue(_opt_alignment);
            
            // Handle shadow file inference
            if (shadowOption != null && shadow == null) {
                string baseName = Path.GetFileNameWithoutExtension(textures[0].Name);
                baseName = baseName.Replace("-variant", "").Replace("variant", ""); // just in case the user included "variant" in the name
                string extension = Path.GetExtension(textures[0].Name);
                string directory = textures[0].DirectoryName ?? ".";
                string shadowPath = Path.Combine(directory, $"{baseName}-shadow{extension}");
                shadow = new(shadowPath);
                if (!shadow.Exists) {
                    throw new FileNotFoundException($"Shadow file not found: {shadowPath}");
                }
            }
            
            // Handle variants
            if (variants > 1) {
                // Duplicate initial texture by adding number prior to extension
                // e.g. ("test.png", 3) -> ["test1.png", "test2.png", "test3.png"]
                if (textures.Count != 1) {
                    throw new InvalidOperationException("When --variants is greater than 1, exactly one texture must be provided.");
                }
                string baseName = Path.GetFileNameWithoutExtension(textures[0].Name);
                if (!baseName.Contains("-variant")) {
                    baseName += "-variant";
                } else if (!baseName.Contains("variant")) {
                    baseName += "variant";
                }
                string extension = Path.GetExtension(textures[0].Name);
                string directory = textures[0].DirectoryName ?? ".";
                textures.Clear();
                for (int i = 1; i <= variants; i++) {
                    string variantPath = Path.Combine(directory, $"{baseName}{i}{extension}");
                    if (!File.Exists(variantPath)) {
                        throw new FileNotFoundException($"Variant file not found: {variantPath}");
                    }
                    textures.Add(new(variantPath));
                }
            }
            
            // Process the texture(s)
            if (textures.Count == 1) {
                await ProcessTextureSingle(textures[0], shadow, scale, alignment);
            } else {
                await ProcessTextureMultiple(textures, shadow, scale, alignment);
            }
        }
        
        /// <summary>
        /// Processes a single texture.
        /// </summary>
        /// <param name="texture">The texture file to process.</param>
        /// <param name="shadowTexture">An optional shadow texture file to process.</param>
        /// <param name="scale">The scale factor for resizing the image.</param>
        /// <param name="alignment">The alignment for image placement.</param>
        private static async Task ProcessTextureSingle(FileInfo texture, FileInfo? shadowTexture, double scale, (double X, double Y) alignment) {
            // Load the file
            using Image<Rgba32> image = Image.Load<Rgba32>(texture.FullName);
            using Image<Rgba32>? shadowImage = shadowTexture != null ? Image.Load<Rgba32>(shadowTexture.FullName) : null;
            Console.WriteLine($"Loaded image: {texture.FullName} ({image.Width}x{image.Height})");
            if (shadowImage != null) {
                Console.WriteLine($"Loaded shadow: {shadowTexture!.FullName} ({shadowImage.Width}x{shadowImage.Height})");
            }
            
            // Trim image
            Processor.TrimWhitespace(image);
            double imageScale = 64.0 / Math.Max(image.Width, image.Height);
            Console.WriteLine($"Trimmed whitespace, cropped image to: {image.Width}x{image.Height}");
            
            // Resize to 64x64, maintaining aspect ratio, respecting scaling factor
            Processor.ResizeWithAspect(image, 64, scale);
            Console.WriteLine($"Resized image to: {image.Width}x{image.Height}");
            
            // Process shadow
            if (shadowImage != null) {
                // Trim shadow
                Processor.TrimWhitespace(shadowImage);
                Console.WriteLine($"Trimmed whitespace, cropped shadow to: {shadowImage.Width}x{shadowImage.Height}");
                
                // Determine sizing ratio
                double targetSize = Math.Max(shadowImage.Width, shadowImage.Height) * imageScale;
                Processor.ResizeWithAspect(shadowImage, targetSize, scale);
                Console.WriteLine($"Resized shadow to: {shadowImage.Width}x{shadowImage.Height}");
            }
            
            // Suggest alignment values
            Processor.SuggestAlignment(image, shadowImage, alignment);
            
            // Save the processed image
            string outputPath = (texture.DirectoryName ?? ".") + '/' + Path.GetFileNameWithoutExtension(texture.Name) + "-processed.png";
            await image.SaveAsPngAsync(outputPath);
            if (shadowImage != null) {
                string shadowOutputPath = (shadowTexture!.DirectoryName ?? ".") + '/' + Path.GetFileNameWithoutExtension(shadowTexture.Name) + "-processed.png";
                await shadowImage.SaveAsPngAsync(shadowOutputPath);
            }
        }
        
        /// <summary>
        /// Processes multiple textures.
        /// </summary>
        /// <param name="textures">The texture files to process.</param>
        /// <param name="shadowTexture">An optional shadow texture file to process.</param>
        /// <param name="scale">The scale factor for resizing the images.</param>
        /// <param name="alignment">The alignment for image placement.</param>
        private static async Task ProcessTextureMultiple(IReadOnlyList<FileInfo> textures, FileInfo? shadowTexture, double scale, (double X, double Y) alignment) {
            // Load all the files
            List<Image<Rgba32>> images = new(textures.Count);
            Image<Rgba32>? shadowImage = null;
            try {
                for (int i = 0; i < textures.Count; i++) {
                    images.Add(Image.Load<Rgba32>(textures[i].FullName));
                    Console.WriteLine($"Loaded image: {textures[i].FullName} ({images[i].Width}x{images[i].Height})");
                }
                if (shadowTexture != null) {
                    shadowImage = Image.Load<Rgba32>(shadowTexture.FullName);
                    Console.WriteLine($"Loaded shadow: {shadowTexture.FullName} ({shadowImage.Width}x{shadowImage.Height})");
                }
                
                // Validate the textures are the same width and height
                for (int i = 1; i < images.Count; i++) {
                    if (images[i].Width != images[0].Width || images[i].Height != images[0].Height) {
                        throw new InvalidOperationException("All textures must have the same dimensions.");
                    }
                }
                
                // Process all images
                double imageScale = 1.0;
                for (int i = 0; i < images.Count; i++) {
                    // Trim whitespace
                    Processor.TrimWhitespace(images[i]);
                    if (i == 0) imageScale = 64.0 / Math.Max(images[0].Width, images[0].Height);
                    Console.WriteLine($"Trimmed whitespace, cropped image {(i + 1)} to: {images[i].Width}x{images[i].Height}");
                    
                    // Resize to 64x64, maintaining aspect ratio, respecting scaling factor
                    Processor.ResizeWithAspect(images[i], 64, scale);
                    Console.WriteLine($"Resized image {(i + 1)} to: {images[i].Width}x{images[i].Height}");
                }
                if (shadowImage != null) {
                    // Trim shadow
                    Processor.TrimWhitespace(shadowImage);
                    Console.WriteLine($"Trimmed whitespace, cropped shadow to: {shadowImage.Width}x{shadowImage.Height}");
                    
                    // Determine sizing ratio
                    double targetSize = Math.Max(shadowImage.Width, shadowImage.Height) * imageScale;
                    Processor.ResizeWithAspect(shadowImage, targetSize, scale);
                    Console.WriteLine($"Resized shadow to: {shadowImage.Width}x{shadowImage.Height}");
                }
                
                // Create a new image to contain the sprite sheet
                int width = images.Count * images[0].Width;
                int height = images[0].Height;
                using Image<Rgba32> spriteSheet = new(width, height);
                for (int i = 0; i < images.Count; i++) {
                    // ReSharper disable AccessToModifiedClosure
                    spriteSheet.Mutate(ctx => ctx.DrawImage(images[i], new Point(i * images[i].Width, 0), 1f));
                    // ReSharper enable AccessToModifiedClosure
                }
                
                // Suggest alignment values
                Console.WriteLine($"Loaded spritesheet: {spriteSheet.Width}x{spriteSheet.Height}");
                Console.WriteLine($"Individual sprite size: {images[0].Width}x{images[0].Height}");
                Console.WriteLine($"Variation count: {images.Count}");
                Console.WriteLine($"Line length: {images.Count}");
                Console.WriteLine($"Shadow repeat: {images.Count}");
                Processor.SuggestAlignment(images[0], shadowImage, alignment);
                
                // Save the processed sprite sheet
                string outputPath = (textures[0].DirectoryName ?? ".") + '/' + Path.GetFileNameWithoutExtension(textures[0].Name) + "-processed.png";
                await spriteSheet.SaveAsPngAsync(outputPath);
                if (shadowImage != null) {
                    string shadowOutputPath = (shadowTexture!.DirectoryName ?? ".") + '/' + Path.GetFileNameWithoutExtension(shadowTexture.Name) + "-processed.png";
                    await shadowImage.SaveAsPngAsync(shadowOutputPath);
                }
            } finally {
                // Dispose of images after processing
                for (int i = 0; i < images.Count; i++) {
                    images[i]?.Dispose(); // potential nullability since it might not be loaded
                }
            }
        }
        
    }
    
}