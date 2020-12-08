# collector-dmesg

> **Collect a count of certain kernel log messages.**  
> A [`telemetry`](https://github.com/telemetry-js/telemetry) plugin.

[![npm status](http://img.shields.io/npm/v/telemetry-js/collector-dmesg.svg)](https://www.npmjs.org/package/@telemetry-js/collector-dmesg)
[![node](https://img.shields.io/node/v/@telemetry-js/collector-dmesg.svg)](https://www.npmjs.org/package/@telemetry-js/collector-dmesg)
[![Test](https://github.com/telemetry-js/collector-dmesg/workflows/Test/badge.svg?branch=main)](https://github.com/telemetry-js/collector-dmesg/actions)
[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

## Table of Contents

<details><summary>Click to expand</summary>

- [Usage](#usage)
  - [Included messages](#included-messages)
- [API](#api)
  - [Options](#options)
- [Install](#install)
- [Acknowledgements](#acknowledgements)
- [License](#license)

</details>

## Usage

```js
const telemetry = require('@telemetry-js/telemetry')()
const dmesg = require('@telemetry-js/collector-dmesg')

telemetry.task()
  .collect(dmesg)
```

### Included messages

- `TCP: [..] Possible SYN flooding [..]`
  - Happens when `net.ipv4.tcp_max_syn_backlog` is exceeded
  - Suggested action: if amount of `SYN` is legit (not DDOS), increase `tcp_max_syn_backlog`
- `TCP: too many orphaned sockets`
  - Happens when `net.ipv4.tcp_max_orphans` is exceeded
  - Suggested action: if amount of orphans is legit, increase `tcp_max_orphans` and consider disabling `tcp_orphan_retries` to significantly decrease the lifetime of orphans
- `TCP: out of memory [..]`
  - Suggested action: tune `net.ipv4.tcp_mem`
- `net_ratelimit: [..] callbacks suppressed`
  - Can happen when too many messages are logged too fast. The kernel will suppress surplus messages and can thus also prevent the above messages from reaching us.

## API

### Options

_Yet to document._

## Install

With [npm](https://npmjs.org) do:

```
npm install @telemetry-js/collector-dmesg
```

## Acknowledgements

This project is kindly sponsored by [Reason Cybersecurity Inc](https://reasonsecurity.com).

[![reason logo](https://cdn.reasonsecurity.com/github-assets/reason_signature_logo.png)](https://reasonsecurity.com)

## License

[MIT](LICENSE) © Vincent Weevers
