import redis from 'redis';

const client = redis.createClient();
const channel = 'ALX channel';

client.on('connect', () => {
  console.log('Redis client connected to the server');
});

client.on('error', (err) => {
  console.log(`Redis client not connected to the server: ${err.message}`);
});

client.subscribe(channel);

client.on('message', (chan, message) => {
  if (chan === channel) {
    console.log(message);
    if (message === 'KILL_SERVER') {
      client.unsubscribe(channel);
      client.quit();
    }
  }
});

