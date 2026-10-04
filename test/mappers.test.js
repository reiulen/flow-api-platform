import test from 'node:test';
import assert from 'node:assert/strict';
import { mapModels, mapProjects, mapProjectContents, formatProtoTimestamp, urls } from '../src/mappers.js';

test('formatProtoTimestamp converts proto seconds and nanos to ISO string', () => {
  assert.equal(formatProtoTimestamp([1786077150, 947878000]), '2026-08-07T04:32:30.947Z');
  assert.equal(formatProtoTimestamp(null), null);
  assert.equal(formatProtoTimestamp([]), null);
});

test('urls recursively extracts http/https strings', () => {
  const tree = [
    'invalid',
    'https://example.com/a.png',
    { nested: ['http://cdn.test/b.mp4', 123] }
  ];
  const found = urls(tree);
  assert.deepEqual(found, ['https://example.com/a.png', 'http://cdn.test/b.mp4']);
});

test('mapModels transforms raw Google Flow proto data into clean REST structure', () => {
  const mockModels = [[
    null,
    null,
    [
      [1, [null, null, 'narwhal_display', 'veo_3_1_lite']],
      [2, [null, null, 'narwhal_display', 'abra']]
    ],
    [['GEM_PIX', ['Nano Banana']]],
    [
      [
        'Omni 1.1 Flash',
        [
          [
            'abra_t2v_4s',
            null, null, null,
            [[1, [[null, 7]]]],
            null, null,
            [[[[1]]]],
            null, null, true, null,
            [[2, 1]],
            null, 120, null, 4, true, null, null, null, [], null,
            [[1]]
          ],
          [
            'abra_r2v_6s',
            null, null, null,
            [[1, [[null, 10]]]],
            null, null,
            [[[[1, 6]]]],
            null, 7, true, null,
            [[2, 1]],
            null, 120, null, 6, true, null, null, null, [5, 3, 7], null,
            [[1]]
          ]
        ],
        true,
        'abra',
        [['Omni Flash']]
      ],
      [
        'Veo 3.1 - Upsampler 1080P',
        [
          [
            'veo_3_1_upsampler_1080p',
            null, null, null,
            [[1, [null, []]], [2, [[null, 0]]]],
            null, null,
            [[[[15]]]],
            null, null, true, null,
            [[2]],
            null, 330, null, 60, true, null, null, null, [], true,
            [[2]]
          ]
        ],
        true,
        'veo_3_1_upsampler_1080p'
      ]
    ],
    [
      [
        '🍌 Nano Banana Pro',
        [
          [
            'GEM_PIX_2',
            null, null, null,
            [[1, [[null, 0]]]],
            null, null, null, null, null, null, null, null,
            [[1, 2, 3, 4, 5]],
            40, null, null, true
          ]
        ],
        true,
        'nano_banana_pro'
      ]
    ],
    null,
    [
      [
        'Gemini TTS',
        [
          [
            'gemini_v4s_tts_flow',
            null, null, null,
            [[1, [[null, 0]]]]
          ]
        ],
        null,
        'gemini_tts'
      ]
    ]
  ]];

  const mockStatuses = [[['abra', 1], ['veo_3_1_lite', 1]]];

  const result = mapModels(mockModels, mockStatuses);

  // Summary
  assert.equal(result.summary.defaultImageModel, 'narwhal_display');
  assert.equal(result.summary.defaultVideoModel, 'veo_3_1_lite');
  assert.equal(result.summary.totalVideoModels, 2);
  assert.equal(result.summary.totalImageModels, 1);
  assert.equal(result.summary.totalAudioModels, 1);

  // QuickList
  assert.equal(result.quickList.videoGenerationModels[0].id, 'abra');
  assert.equal(result.quickList.videoGenerationModels[0].status, 'online');
  assert.equal(result.quickList.imageGenerationModels[0].id, 'nano_banana_pro');
  assert.equal(result.quickList.upscalers[0].id, 'veo_3_1_upsampler_1080p');

  // Video Models detail
  const abra = result.videoModels.find((m) => m.id === 'abra');
  assert.ok(abra);
  assert.equal(abra.name, 'Omni 1.1 Flash');
  assert.equal(abra.status, 'online');
  assert.deepEqual(abra.aliases, ['Omni Flash']);
  assert.equal(abra.variants.length, 2);

  const t2v = abra.variants[0];
  assert.equal(t2v.id, 'abra_t2v_4s');
  assert.equal(t2v.mode, 'text_to_video');
  assert.equal(t2v.durationSeconds, 4);
  assert.equal(t2v.resolution, '720p');
  assert.equal(t2v.creditCost, 7);
  assert.deepEqual(t2v.aspectRatios, ['16:9', '9:16']);

  const r2v = abra.variants[1];
  assert.equal(r2v.mode, 'reference_to_video');
  assert.equal(r2v.durationSeconds, 6);
  assert.equal(r2v.creditCost, 10);
  assert.equal(r2v.features.referenceImages, true);

  // Image Models detail
  const banana = result.imageModels.find((m) => m.id === 'nano_banana_pro');
  assert.ok(banana);
  assert.equal(banana.name, '🍌 Nano Banana Pro');
  assert.equal(banana.category, 'image');
  assert.equal(banana.variants[0].creditCost, 0);
  assert.deepEqual(banana.variants[0].aspectRatios, ['1:1', '16:9', '9:16', '4:3', '3:4']);
});

test('mapProjects transforms raw projects list with ISO dates', () => {
  const raw = [
    [
      ['8f5d96f8-ccf2-4d5f-8877-a133d9998870', ['Aug 07, 11:32 AM', null, [1786077150, 947878000]]],
      ['a5689314-8bfb-410f-90e2-4d789ee26105', ['Aug 07, 12:07 AM', null, [1786036058, 841021000], null, 'user_uuid_123']]
    ],
    'page_token_abc'
  ];

  const result = mapProjects(raw);
  assert.equal(result.total, 2);
  assert.equal(result.nextPageToken, 'page_token_abc');
  assert.equal(result.projects[0].id, '8f5d96f8-ccf2-4d5f-8877-a133d9998870');
  assert.equal(result.projects[0].title, 'Aug 07, 11:32 AM');
  assert.equal(result.projects[0].updatedAt, '2026-08-07T04:32:30.947Z');
  assert.equal(result.projects[0].authorId, null);
  assert.equal(result.projects[1].authorId, 'user_uuid_123');
});

test('mapProjectContents parses media items, dimensions, URLs and voices', () => {
  const raw = [
    null, null, null,
    [
      [
        'media-1',
        1,
        null,
        [
          'media-1',
          'proj-123',
          'hash',
          'CAE',
          null,
          [[1771069916, 461172000], null, null, null, null, null, [], null, null, 1, null, null, null, 327611],
          [null, [null, null, null, null, 3], [1819, 1023]]
        ]
      ],
      [
        'voice-1',
        3,
        'Achernar',
        [
          'voice-1', null, null, null, null, null, null, null, null, null,
          [['Achernar', 'Female, soft, high pitch', true, 'https://gstatic.com/sample.wav']]
        ]
      ]
    ],
    null, null, null,
    [
      null, null,
      [[null, 3, 2, null, 'narwhal_display'], [null, 2, 1, null, 'abra']]
    ]
  ];

  const result = mapProjectContents('proj-123', raw);
  assert.equal(result.found, true);
  assert.equal(result.mediaCount, 1);
  assert.equal(result.voiceCount, 1);
  assert.equal(result.media[0].id, 'media-1');
  assert.equal(result.media[0].fileSizeBytes, 327611);
  assert.equal(result.media[0].width, 1819);
  assert.equal(result.media[0].height, 1023);
  assert.equal(result.voices[0].name, 'Achernar');
  assert.equal(result.voices[0].description, 'Female, soft, high pitch');
  assert.equal(result.voices[0].sampleUrl, 'https://gstatic.com/sample.wav');
  assert.equal(result.selectedModels.imageModel, 'narwhal_display');
  assert.equal(result.selectedModels.videoModel, 'abra');
});

test('mapProjectContents handles null contents gracefully', () => {
  const result = mapProjectContents('missing-proj', null);
  assert.equal(result.found, false);
  assert.equal(result.mediaCount, 0);
  assert.ok(result.message);
});

test('mapProjectContents parses generated outputs from raw[2]', () => {
  const raw = [
    null,
    null,
    [
      [
        'gen-media-1',
        'proj-456',
        'session-1',
        'CAE',
        null,
        [
          [1790778583, 774571000],
          null, null, null, null,
          'https://lh3.googleusercontent.com/asb/test-image-url',
          [null, null, [['A sunset over the ocean', null, [[['A sunset over the ocean']]]]]],
          null, null, 1,
          'https://lh3.googleusercontent.com/asb/test-image-url',
          null, null,
          818534
        ],
        [[null, 1234], null, [1376, 768]]
      ]
    ],
    []
  ];

  const result = mapProjectContents('proj-456', raw);
  assert.equal(result.found, true);
  assert.equal(result.mediaCount, 1);
  assert.equal(result.media[0].id, 'gen-media-1');
  assert.equal(result.media[0].prompt, 'A sunset over the ocean');
  assert.equal(result.media[0].fileSizeBytes, 818534);
  assert.equal(result.media[0].width, 1376);
  assert.equal(result.media[0].height, 768);
  assert.deepEqual(result.media[0].urls, ['https://lh3.googleusercontent.com/asb/test-image-url']);
});

