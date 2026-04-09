import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDb } from '../startup/connectDb.js';
import { ReadingPassage } from '../models/ReadingPassage.js';
import { Question } from '../models/Question.js';

await connectDb();

// 1. Upsert the passage "The Science of Sleep"
const title = 'The Science of Sleep';
const subject = 'English';
const body = `Sleep is one of the most essential functions of the human body, yet it remains partially mysterious. During sleep, the brain processes information, consolidates memories, and restores energy. Scientists have identified different stages of sleep, each playing a unique role in mental and physical health. Without adequate sleep, the immune system weakens, and cognitive functions like focus and problem-solving become significantly impaired.`;

const passage = await ReadingPassage.findOneAndUpdate(
  { title, subject },
  { $set: { title, subject, body, isActive: true } },
  { upsert: true, new: true }
);

console.log(`Passage upserted: "${passage.title}"`);

// 2. Questions for this passage
const questions = [
  {
    subject,
    questionText: 'What is one of the primary functions of the brain during sleep according to the passage?',
    options: {
      A: 'Consolidating memories',
      B: 'Generating new muscle tissue',
      C: 'Digesting food',
      D: 'Maintaining body temperature',
    },
    correctAnswer: 'A',
    answerExplanation: 'The passage states that the brain consolidates memories during sleep.',
    passageRef: passage._id,
    isActive: true,
  },
  {
    subject,
    questionText: 'What happens to the immune system without adequate sleep?',
    options: {
      A: 'It becomes stronger',
      B: 'It remains unchanged',
      C: 'It weakens',
      D: 'It stops functioning entirely',
    },
    correctAnswer: 'C',
    answerExplanation: 'The passage mentions the immune system weakens without adequate sleep.',
    passageRef: passage._id,
    isActive: true,
  },
  {
    subject,
    questionText: 'Which cognitive functions are mentioned as being impaired by lack of sleep?',
    options: {
      A: 'Vision and hearing',
      B: 'Focus and problem-solving',
      C: 'Walking and talking',
      D: 'Dreaming and imagination',
    },
    correctAnswer: 'B',
    answerExplanation: 'Focus and problem-solving are specifically mentioned.',
    passageRef: passage._id,
    isActive: true,
  },
];

// Clean up existing questions for this passage to avoid duplicates if re-running
await Question.deleteMany({ passageRef: passage._id });
const result = await Question.insertMany(questions);

console.log(`Inserted ${result.length} questions for "${passage.title}".`);

await mongoose.disconnect();
console.log('Seed finished.');
process.exit(0);
