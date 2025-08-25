module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind',  unstable_transformImportMeta: true }],
      'nativewind/babel',
      '@babel/preset-env', '@babel/preset-react',
    ],
  };
};