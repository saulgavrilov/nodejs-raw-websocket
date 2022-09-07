const { createServer } = require('http');
const crypto = require('crypto');
const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const SIXTYFOUR_BITS_INTEGER_MARKER = 127;
const FIRST_BIT = 128;
const MASK_KEY_BYTES_LENGTH = 4;
const PORT = 1337;

const server = createServer((request, response) => {
  response.writeHead(200).end('Hey there');
});

server.on('upgrade', onSocketUpgrade);

function onSocketUpgrade(req, socket, head) {
  const { 'sec-websocket-key': webClientSocketKey } = req.headers;
  const headers = prepareHandShakeHeaders(webClientSocketKey);

  // console.log(`${webClientSocketKey} connected`);

  socket.write(headers);
  socket.on('readable', () => onSocketReadable(socket));
}

function onSocketReadable(socket) {
  // consume optcode (first byte)
  // 1 = 1 byte = 8 bits
  socket.read(1);

  const [markerAndPayloadLength] = socket.read(1);
  // MASK Indicator
  const lengthIndicatorInBits = markerAndPayloadLength - FIRST_BIT;

  let messageLength = 0;

  if (lengthIndicatorInBits <= SEVEN_BITS_INTEGER_MARKER) {
    messageLength = lengthIndicatorInBits;
  } else {
    throw new Error(`Your message is too long we don't handle 64-bit message`);
  }

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
  const encoded = socket.read(messageLength);
  const decoded = unmask(encoded, maskKey);
  const received = decoded.toString('utf-8');

  const data = JSON.stringify(received);

  console.log(`Message Received: ${data}`);
}

function unmask(encodedBuffer, maskKey) {
  let finalBuffer = Buffer.from(encodedBuffer);

  const fillWithEightZeros = (t) => t.padStart(8, '0');
  const toBinary = (t) => fillWithEightZeros(t.toString(2));
  const fromBinaryToDecimal = (t) => parseInt(toBinary(t), 2);
  const getCharFromBinary = (t) => String.fromCharCode(fromBinaryToDecimal(t));

  for (let i = 0; i < encodedBuffer.length; i++) {
    finalBuffer[i] = encodedBuffer[i] ^ maskKey[i % MASK_KEY_BYTES_LENGTH];
    const logger = {
      unmaskingCalc: `${toBinary(encodedBuffer[i])} ^ ${toBinary(
        maskKey[i % MASK_KEY_BYTES_LENGTH]
      )} = ${toBinary(finalBuffer[i])}`,
      decoded: getCharFromBinary(finalBuffer[i]),
    };
    console.log(logger);
  }
  return finalBuffer;
}

function prepareHandShakeHeaders(id) {
  const acceptKey = createSocketAccept(id);
  const headers = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '',
  ]
    .map((line) => line.concat('\r\n'))
    .join('');
  return headers;
}

function createSocketAccept(id) {
  const shaum = crypto.createHash('sha1');
  shaum.update(id + WEBSOCKET_MAGIC_STRING_KEY);
  return shaum.digest('base64');
}

server.listen(PORT, () => console.log(`Server listening to ${PORT}`));

// Error handling to keep the server on
['uncaughtException', 'unhandledRejection'].forEach((event) => {
  process.on(event, (err) => {
    console.error(
      `Something bad happened!\nevent: ${event}\nmsg: ${err.msg}\nstack: ${err.stack}`
    );
  });
});
