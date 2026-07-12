import corpus from'./fixtures/corpus.json' with {type:'json'};import questions from'./fixtures/questions.json' with {type:'json'};import{createFixedEmbeddingProvider}from'../src/index.ts';import{runBenchmark,type BenchmarkCorpus,type BenchmarkQuestion}from'./benchmark.ts';
const metrics=await runBenchmark(corpus as BenchmarkCorpus,(questions.questions as BenchmarkQuestion[]),createFixedEmbeddingProvider());
process.stdout.write(`${JSON.stringify(metrics,null,2)}\n`);
