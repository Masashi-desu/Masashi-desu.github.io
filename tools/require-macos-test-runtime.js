/**
 * ローカルのリリース品質ゲートに必要なネイティブ媒体・GPUテストを、
 * 対象外のOSで誤って成功扱いにしないための実行環境ガード。
 */
if (process.platform !== 'darwin') {
  console.error('test:local-environment requires macOS (darwin). Run test:ci on non-macOS environments.');
  process.exit(1);
}

console.log('macOS runtime confirmed for local environment-dependent tests.');
