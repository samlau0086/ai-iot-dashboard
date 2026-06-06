import * as RGL from 'react-grid-layout';

console.log('RGL keys:', Object.keys(RGL).join(', '));
if (RGL.default) {
  console.log('RGL.default keys:', Object.keys(RGL.default).join(', '));
}
