const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 모노레포 루트와 shared 패키지를 watch
config.watchFolders = [monorepoRoot];

// node_modules 해석 경로
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// @yut-nori/shared를 소스(.ts)에서 직접 해석
config.resolver.extraNodeModules = {
  '@yut-nori/shared': path.resolve(monorepoRoot, 'packages/shared/src'),
};

module.exports = config;
