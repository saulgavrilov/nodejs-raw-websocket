const { createServer } = require('http');
const crypto = require('crypto');
const WEBSOCKET_MAGIC_STRING_KEY = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const SEVEN_BITS_INTEGER_MARKER = 125;
const SIXTEEN_BITS_INTEGER_MARKER = 126;
const SIXTYFOUR_BITS_INTEGER_MARKER = 127;
const MAXIMUM_SIXTEENBITS_INTEGER = 2 ** 16;
const FIRST_BIT = 128;
const OPCODE_TEXT = 0x01; // 1 bit in binary
const MASK_KEY_BYTES_LENGTH = 4;
const PORT = 1337;

const server = createServer((request, response) => {
  response.writeHead(200).end('Hey there');
});

server.on('upgrade', onSocketUpgrade);

function onSocketUpgrade(req, socket, head) {
  const { 'sec-websocket-key': webClientSocketKey } = req.headers;
  const headers = prepareHandShakeHeaders(webClientSocketKey);

  socket.write(headers);
  socket.on('readable', () => onSocketReadable(socket));
}

function sendMessage(msg, socket) {
  const dataFrameBuffer = prepareMessage(msg);
  socket.write(dataFrameBuffer);
}

function prepareMessage(message) {
  const msg = Buffer.from(message);
  const messageSize = msg.length;

  let dataFrameBuffer;

  // 0x80 === 128 in binary
  // '0x' + Math.abs(128).toString(16) == 0x80
  const firstByte = 0x80 | OPCODE_TEXT; // single frame + text

  if (messageSize <= SEVEN_BITS_INTEGER_MARKER) {
    const bytes = [firstByte];
    dataFrameBuffer = Buffer.from(bytes.concat(messageSize));
  } else if (messageSize <= MAXIMUM_SIXTEENBITS_INTEGER) {
    const offsetFourBytes = 4;
    const target = Buffer.allocUnsafe(offsetFourBytes);

    target[0] = firstByte;
    target[1] = SIXTEEN_BITS_INTEGER_MARKER | 0x0;

    target.writeUInt16BE(messageSize, 2);
    dataFrameBuffer = target;
  } else {
    throw new Error('message too long ):');
  }

  const totalLength = dataFrameBuffer.byteLength + messageSize;

  const dataFrameResponse = concat([dataFrameBuffer, msg], totalLength);

  return dataFrameResponse;
}

function concat(bufferList, totalLength) {
  const target = Buffer.allocUnsafe(totalLength);
  let offset = 0;

  for (const buffer of bufferList) {
    target.set(buffer, offset);
    offset += buffer.length;
  }

  return target;
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
  } else if (lengthIndicatorInBits === SIXTEEN_BITS_INTEGER_MARKER) {
    messageLength = socket.read(2).readUint16BE(0);
  } else {
    throw new Error(`Your message is too long we don't handle 64-bit message`);
  }

  const maskKey = socket.read(MASK_KEY_BYTES_LENGTH);
  const encoded = socket.read(messageLength);
  const decoded = unmask(encoded, maskKey);
  const received = decoded.toString('utf-8');

  const data = JSON.stringify(received);

  const msg = JSON.stringify({
    message: data,
    at: new Date().toISOString(),
  });

  sendMessage(msg, socket);
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
