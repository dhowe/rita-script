// web/minimal

module.exports =
{
  mode: 'development',
  target: 'web',
  output: {
    path: require('path').resolve(__dirname, '../dist'),
    library: 'RiTa',
    filename: 'rita.js',
    chunkFilename: 'rita-full.js',
  },
  performance: {
    hints: false
  },
  watchOptions: {
    ignored: /node_modules/
  },
  node: {
    fs: "empty"
  },
  entry: { 'rita': './src/rita.js' },
  plugins: [new (require('webpack').DefinePlugin)({
    NOLEX: JSON.stringify(true),
  })]
};
