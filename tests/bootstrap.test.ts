import test from 'node:test'; import assert from 'node:assert/strict'; import {validateConfig} from '../src/bootstrap/validation.js'; import {splitProviderModel} from '../src/schemas/config.js';
const provider={name:'my-router',type:'openai-compatible' as const,baseUrl:'https://router.example/v1',apiKeys:'MY_KEYS',models:['openai/gpt-5.6-luna'],defaultModel:'openai/gpt-5.6-luna'};
test('splits only on the first slash',()=>assert.deepEqual(splitProviderModel('my-router/openai/gpt-5.6-luna'),{provider:'my-router',model:'openai/gpt-5.6-luna'}));
test('rejects cyclic combo references',()=>assert.throws(()=>validateConfig([provider],[{name:'a',strategy:'priority',targets:{models:[],combos:['b']}},{name:'b',strategy:'priority',targets:{models:[],combos:['a']}}]),/Cyclic/));
test('validates the new DSL',()=>assert.doesNotThrow(()=>validateConfig([provider],[{name:'coding',strategy:'priority',targets:{models:['my-router/openai/gpt-5.6-luna'],combos:[]}}])));
