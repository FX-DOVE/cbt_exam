import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../startup/connectDb.js';
import { ReadingPassage } from '../models/ReadingPassage.js';
import { Question } from '../models/Question.js';

await connectDb();

// 1. Upsert the passage
const passage = await ReadingPassage.findOneAndUpdate(
  { title: 'The Last Train', subject: 'English' },
  {
    $set: {
      title: 'The Last Train',
      subject: 'English',
      body: `The station was nearly empty when the final train of the night arrived. A faint hum echoed through the platform as its doors slid open. Marcus hesitated before stepping inside, clutching a worn leather bag that carried everything he owned. He wasn't sure where the train would take him, only that staying behind was no longer an option. As the train began to move, he watched the city lights blur into streaks, wondering if leaving was an act of courage—or escape.`,
      isActive: true,
    },
  },
  { upsert: true, new: true }
);

console.log(`Passage upserted: "${passage.title}" (_id: ${passage._id})`);

// 2. Seed the 4 comprehension questions linked to this passage
const questions = [
  {
    subject: 'English',
    questionText: 'Why does Marcus decide to get on the train?',
    options: {
      A: 'He wants to visit a friend',
      B: 'He has no other choice but to leave',
      C: 'He enjoys traveling at night',
      D: 'He missed an earlier train',
    },
    correctAnswer: 'B',
    passageRef: passage._id,
    isActive: true,
  },
  {
    subject: 'English',
    questionText: 'What does the "worn leather bag" suggest about Marcus?',
    options: {
      A: 'He is wealthy and fashionable',
      B: 'He is going on a short trip',
      C: 'He carries all his important belongings with him',
      D: 'He recently bought new luggage',
    },
    correctAnswer: 'C',
    passageRef: passage._id,
    isActive: true,
  },
  {
    subject: 'English',
    questionText: 'How is the station described at the beginning of the passage?',
    options: {
      A: 'Busy and crowded',
      B: 'Loud and chaotic',
      C: 'Nearly empty and quiet',
      D: 'Bright and cheerful',
    },
    correctAnswer: 'C',
    passageRef: passage._id,
    isActive: true,
  },
  {
    subject: 'English',
    questionText: 'What is Marcus mainly thinking about as the train moves?',
    options: {
      A: 'What he will eat next',
      B: 'Whether he should have stayed',
      C: 'How fast the train is going',
      D: 'Who else is on the train',
    },
    correctAnswer: 'B',
    passageRef: passage._id,
    isActive: true,
  },
];

const result = await Question.insertMany(questions);
console.log(`Inserted ${result.length} English comprehension question(s) linked to "${passage.title}".`);

await mongoose.disconnect();
console.log('Done. Database connection closed.');
process.exit(0);
