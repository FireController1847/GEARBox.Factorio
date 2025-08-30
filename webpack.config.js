const webpack = require("webpack");
const path = require("path");
const { version } = require("./package.json");
const TerserPlugin = require("terser-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const banner = `/*!
 * GEARBox.Factorio Visual Editor v${version}
 * https://github.com/FireController1847/GEARBox.Factorio
 *
 * Copyright (c) ${new Date().getFullYear()} FireController#1847
 * Released under the GNU General Public License v3.0
 * https://www.gnu.org/licenses/gpl-3.0.en.html
 *
 * Date: ${new Date().toISOString()}
 */`;
const common = {
    entry: "./src/webpack.ts",
    resolve: {
        extensions: [".ts", ".js"]
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: "ts-loader",
                exclude: /node_modules/
            },
            {
                test: /\.css$/i,
                use: ["style-loader", "css-loader"]
            },
            {
                test: /\.s[ac]ss$/i,
                use: [
                    "style-loader",
                    {
                        loader: "css-loader",
                        options: {
                            url: false
                        }
                    },
                    "sass-loader"
                ]
            },
            {
                test: /\.html$/i,
                loader: "html-loader",
                options: {
                    sources: false
                }
            }
        ]
    }
};
module.exports = [
    // 🔹 Unminified version
    // inside your unminified config
    {
        ...common,
        mode: "development",
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: `visualeditor-${version}.js`,
            clean: true
        },
        optimization: { minimize: false },
        devtool: "source-map",
        devServer: {
            static: {
                directory: path.resolve(__dirname, "dist"), // serve files from dist/
            },
            port: 3000,
            open: true,
            hot: true,
            watchFiles: ["src/**/*"],
        },
        plugins: [
            new webpack.BannerPlugin({ banner, raw: true }),
            new HtmlWebpackPlugin({
                template: "./src/html/app.html",
                filename: "app.html",
                inject: "body"
            }),
            new CopyWebpackPlugin({
                patterns: [
                    { from: "./src/resource", to: "./resource" },
                    { from: "./src/lib", to: "./lib" }
                ]
            })
        ]
    },

    // 🔹 Minified version
    {
        ...common,
        mode: "production",
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: `visualeditor-${version}.min.js`
        },
        optimization: {
            minimize: true,
            minimizer: [
                new TerserPlugin({
                    extractComments: false,
                    terserOptions: {
                        compress: { drop_console: true },
                        mangle: true
                    }
                })
            ]
        },
        plugins: [
            new webpack.BannerPlugin({
                banner: () =>
                    `/*! GEARBox.Factorio Visual Editor v${version} | (c) ${new Date().getFullYear()} FireController#1847 | Released under the GNU GPL v3.0 */\n;`,
                raw: true
            }),
            new HtmlWebpackPlugin({
                template: "./src/html/app.html",
                filename: "app.html",
                inject: "body"
            })
        ]
    }
];
