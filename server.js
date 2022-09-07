const { createServer } = require('http');

const PORT = 1337;

createServer((request, response) => {
  response.writeHead(200).end('Hey there');
  throw new Error('test');
}).listen(PORT, () => console.log(`Server listening to ${PORT}`));

// Error handling to keep the server on
['uncaughtException', 'unhandledRejection'].forEach((event) => {
  process.on(event, (err) => {
    console.error(
      `Something bad happened!\nevent: ${event}\nmsg: ${err.msg}\nstack: ${err.stack}`
    );
  });
});
