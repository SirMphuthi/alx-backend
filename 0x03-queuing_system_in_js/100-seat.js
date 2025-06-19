import express from 'express';
import redis from 'redis';
import { promisify } from 'util';
import kue from 'kue';

const client = redis.createClient();

client.on('connect', () => {
  console.log('Redis client connected to the server');
});

client.on('error', (err) => {
  console.log(`Redis client not connected to the server: ${err.message}`);
});

const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);

const INITIAL_SEATS = 50;
let reservationEnabled = true;

async function reserveSeat(number) {
  await setAsync('available_seats', number);
}

async function getCurrentAvailableSeats() {
  const seats = await getAsync('available_seats');
  return seats ? parseInt(seats) : 0;
}

(async () => {
  const currentSeats = await getCurrentAvailableSeats();
  if (currentSeats === 0) {
    await reserveSeat(INITIAL_SEATS);
  }
})();

const queue = kue.createQueue();

const app = express();
const port = 1245;

app.get('/available_seats', async (req, res) => {
  const numberOfAvailableSeats = await getCurrentAvailableSeats();
  res.json({ numberOfAvailableSeats: String(numberOfAvailableSeats) });
});

app.get('/reserve_seat', (req, res) => {
  if (!reservationEnabled) {
    return res.json({ status: 'Reservation are blocked' });
  }

  const job = queue.create('reserve_seat').save((err) => {
    if (err) {
      return res.json({ status: 'Reservation failed' });
    }
    res.json({ status: 'Reservation in process' });
  });

  job.on('complete', () => {
    console.log(`Seat reservation job ${job.id} completed`);
  });

  job.on('failed', (errorMessage) => {
    console.log(`Seat reservation job ${job.id} failed: ${errorMessage}`);
  });
});

queue.process('reserve_seat', 1, async (job, done) => {
  let currentSeats = await getCurrentAvailableSeats();

  if (currentSeats <= 0) {
    reservationEnabled = false;
    return done(new Error('Not enough seats available'));
  }

  const newSeats = currentSeats - 1;
  await reserveSeat(newSeats);

  if (newSeats === 0) {
    reservationEnabled = false;
  }

  done();
});

app.get('/process', (req, res) => {
  res.json({ status: 'Queue processing' });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

process.on('SIGINT', () => {
  queue.shutdown(5000, (err) => {
    console.log('Kue shutdown: ', err || 'completed');
    process.exit(0);
  });
});
