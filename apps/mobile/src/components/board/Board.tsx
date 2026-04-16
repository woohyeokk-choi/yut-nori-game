import { Platform } from 'react-native';
import { SvgBoard } from './SvgBoard';

// 네이티브에서는 Skia, 웹에서는 SVG
// Skia는 웹 미지원이므로 Platform.OS로 분기
// 현재: 웹 테스트 환경이므로 SVG 사용. 네이티브 빌드 시 SkiaBoard로 전환.
export { SvgBoard as Board };

// 네이티브 빌드에서 Skia를 사용하려면:
// import { SkiaBoard } from './SkiaBoard';
// export const Board = Platform.OS === 'web' ? SvgBoard : SkiaBoard;
