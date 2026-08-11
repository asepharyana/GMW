{
  "targets": [
    {
      "target_name": "libdatachannel_min",
      "sources": ["binding.cpp"],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "/home/code/GMW/services/discord-gateway/node_modules/.pnpm/@lng2004+node-datachannel@0.32.0-20260202/node_modules/@lng2004/node-datachannel/build/_deps/libdatachannel-src/include"
      ],
      "libraries": [
        "/tmp/ldc-build/libdatachannel.so.0.24.0"
      ],
      "cflags": ["-std=c++17", "-fexceptions"],
      "cflags_cc": ["-std=c++17", "-fexceptions"],
      "defines": ["NAPI_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='linux'", { "cflags": ["-fvisibility=hidden"] }]
      ]
    }
  ]
}
