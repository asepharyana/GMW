{
  "targets": [
    {
      "target_name": "libdatachannel_min",
      "sources": ["binding.cpp"],
      "include_dirs": [
        "<!(node -e \"console.log(process.env.NAPI_INCLUDE || (() => { try { return require('node-addon-api').include; } catch { return '/nonexistent'; } })())\")",
        "<!(node -e \"const s=process.env.LDC_INCLUDE||'/nix/store/39a85gpfjqy3h3k8jwrwh7m9yc3inqw7-source';console.log(s+'/include')\")"
      ],
      "libraries": [
        "<!(node -e \"const s=process.env.LDC_LIB||'/tmp/ldc-build';console.log(s+'/libdatachannel.so.0.24.0')\")"
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
