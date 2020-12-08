'use strict'

const test = require('tape')
const Collector = require('.')

test('basic', function (t) {
  t.plan(6)

  const now = new Date('2019-03-20T17:21:38Z')
  const c = new Collector({
    cmd: 'node',
    args: ['-e', 'require(\'fs\').createReadStream(\'./fixture.txt\').pipe(process.stdout)'],
    now: () => +now
  })

  process.once('warning', ({ name, message, stack }) => {
    t.is(name, 'TelemetryWarning')
    t.is(message, 'Stopped watching dmesg')
  })

  startAndWait(c, (err) => {
    t.ifError(err, 'no start error')

    const metrics = []
    c.on('metric', metrics.push.bind(metrics))

    c.ping((err) => {
      t.ifError(err, 'no ping error')
      t.same(metrics, [{
        name: 'telemetry.dmesg.delta',
        date: now,
        unit: 'count',
        resolution: 60,
        statistic: 'sum',
        tags: { subject: 'tcp', message: 'possible syn flooding' },
        value: 1
      }, {
        name: 'telemetry.dmesg.delta',
        date: now,
        unit: 'count',
        resolution: 60,
        statistic: 'sum',
        tags: { subject: 'tcp', message: 'too many orphaned sockets' },
        value: 7
      }, {
        name: 'telemetry.dmesg.delta',
        date: now,
        unit: 'count',
        resolution: 60,
        statistic: 'sum',
        tags: { subject: 'tcp', message: 'out of memory' },
        value: 1
      }, {
        name: 'telemetry.dmesg.delta',
        date: now,
        unit: 'count',
        resolution: 60,
        statistic: 'sum',
        tags: { subject: 'net_ratelimit', message: 'callbacks suppressed' },
        value: 2
      }])

      c.stop((err) => {
        t.ifError(err, 'no stop error')
      })
    })
  })
})

test('starts from last position', function (t) {
  t.plan(4)

  const now = new Date('2019-03-20T17:21:40Z')
  const c = new Collector({
    cmd: 'node',
    args: ['-e', 'require(\'fs\').createReadStream(\'./fixture.txt\').pipe(process.stdout)'],
    now: () => +now,
    retryDelay: 50
  })

  startAndWait(c, (err) => {
    t.ifError(err, 'no start error')

    const metrics = []
    c.on('metric', metrics.push.bind(metrics))

    c.ping((err) => {
      t.ifError(err, 'no ping error')
      t.same(metrics, [{
        name: 'telemetry.dmesg.delta',
        date: now,
        unit: 'count',
        resolution: 60,
        statistic: 'sum',
        tags: { subject: 'tcp', message: 'possible syn flooding' },
        value: 1
      }, {
        name: 'telemetry.dmesg.delta',
        date: now,
        unit: 'count',
        resolution: 60,
        statistic: 'sum',
        tags: { subject: 'tcp', message: 'too many orphaned sockets' },
        value: 6
      }, {
        name: 'telemetry.dmesg.delta',
        date: now,
        unit: 'count',
        resolution: 60,
        statistic: 'sum',
        tags: { subject: 'tcp', message: 'out of memory' },
        value: 1
      }, {
        name: 'telemetry.dmesg.delta',
        date: now,
        unit: 'count',
        resolution: 60,
        statistic: 'sum',
        tags: { subject: 'net_ratelimit', message: 'callbacks suppressed' },
        value: 1
      }])

      c.stop((err) => {
        t.ifError(err, 'no stop error')
      })
    })
  })
})

test('emits metrics periodically even if count is 0', function (t) {
  t.plan(9)

  const now = new Date('2100-01-01T00:00:00Z')
  const c = new Collector({
    cmd: 'node',
    args: ['-e', 'setInterval(() => {}, 1e3)'],
    now: () => +now
  })

  startAndWait(c, (err) => {
    t.ifError(err, 'no start error')

    const metrics = []
    c.on('metric', metrics.push.bind(metrics))

    c.ping((err) => {
      t.ifError(err, 'no ping error')
      t.same(metrics.splice(0, metrics.length).map(getValue), [0, 0, 0, 0])

      c.ping((err) => {
        t.ifError(err, 'no ping 2 error')
        t.same(metrics.splice(0, metrics.length), [], 'no metrics')

        // Fast-forward time
        t.ok(c._fillInterval, 'has fillInterval')
        c._nowFn = () => now.getTime() + c._fillInterval

        c.ping((err) => {
          t.ifError(err, 'no ping error')
          t.same(metrics.splice(0, metrics.length).map(getValue), [0, 0, 0, 0])

          c.stop((err) => {
            t.ifError(err, 'no stop error')
          })
        })
      })
    })
  })
})

test.skip('restarts on non-zero exit', function (t) {
  t.plan(8)

  const now = new Date('2019-03-20T17:21:38Z')
  const c = new Collector({
    cmd: 'node',
    now: () => +now,
    args: ['-e', 'process.exit(1)'],
    retryDelay: 50
  })

  process.once('warning', ({ name, message }) => {
    t.is(name, 'TelemetryWarning')
    t.is(message, 'Error watching dmesg: Exited with code 1')
  })

  startAndWait(c, (err) => {
    t.ifError(err, 'no start error')

    const metrics = []
    c.on('metric', metrics.push.bind(metrics))

    c.ping((err) => {
      t.ifError(err, 'no ping error')
      t.same(metrics.splice(0, metrics.length).map(getValue), [0, 0, 0, 0])

      c._args = ['-e', 'require(\'fs\').createReadStream(\'./fixture.txt\').pipe(process.stdout)']

      setTimeout(() => {
        c.ping((err) => {
          t.ifError(err, 'no ping error')
          t.same(metrics.splice(0, metrics.length).map(getValue), [1, 7, 1, 2])

          c.stop((err) => {
            t.ifError(err, 'no stop error')
          })
        })
      }, 500)
    })
  })
})

test.skip('restarts on spawn error', function (t) {
  t.plan(8)

  const now = new Date('2019-03-20T17:21:38Z')
  const c = new Collector({
    cmd: 'node_does_not_exist',
    now: () => +now,
    args: ['-e', 'require(\'fs\').createReadStream(\'./fixture.txt\').pipe(process.stdout)'],
    retryDelay: 50
  })

  process.once('warning', ({ name, message }) => {
    t.is(name, 'TelemetryWarning')
    t.is(message, 'Error watching dmesg: spawn node_does_not_exist ENOENT')
  })

  startAndWait(c, (err) => {
    t.ifError(err, 'no start error')

    const metrics = []
    c.on('metric', metrics.push.bind(metrics))

    c.ping((err) => {
      t.ifError(err, 'no ping error')
      t.same(metrics.splice(0, metrics.length).map(getValue), [0, 0, 0, 0])

      c._cmd = 'node'

      setTimeout(() => {
        c.ping((err) => {
          t.ifError(err, 'no ping error')
          t.same(metrics.splice(0, metrics.length).map(getValue), [1, 7, 1, 2])

          c.stop((err) => {
            t.ifError(err, 'no stop error')
          })
        })
      }, 500)
    })
  })
})

test.skip('restarts on parse error', function (t) {
  t.plan(8)

  const now = new Date('2019-03-20T17:21:38Z')
  const c = new Collector({
    cmd: 'node',
    now: () => +now,
    args: ['-e', 'require(\'fs\').createReadStream(\'./fixture.txt\').pipe(process.stdout)'],
    retryDelay: 50
  })

  process.once('warning', ({ name, message }) => {
    t.is(name, 'TelemetryWarning')
    t.is(message, 'RangeError watching dmesg: test')
  })

  const parse = c._parse
  c._parse = () => { throw new RangeError('test') }

  startAndWait(c, (err) => {
    t.ifError(err, 'no start error')

    const metrics = []
    c.on('metric', metrics.push.bind(metrics))

    c.ping((err) => {
      t.ifError(err, 'no ping error')
      t.same(metrics.splice(0, metrics.length).map(getValue), [0, 0, 0, 0])

      c._parse = parse

      setTimeout(() => {
        c.ping((err) => {
          t.ifError(err, 'no ping error')
          t.same(metrics.splice(0, metrics.length).map(getValue), [1, 7, 1, 2])

          c.stop((err) => {
            t.ifError(err, 'no stop error')
          })
        })
      }, 500)
    })
  })
})

test.skip('kills dmesg on parse error', function (t) {
  t.plan(3)

  const c = new Collector({
    cmd: 'node',
    args: ['-e', 'console.log(\'fake line\'); setInterval(() => {}, 1e3)']
  })

  c._parse = () => { throw new Error('test') }

  c.start((err) => {
    t.ifError(err, 'no start error')

    c._dmesg.on('close', function (code) {
      t.is(code, null, 'closed')

      c.stop((err) => {
        t.ifError(err, 'no stop error')
      })
    })
  })
})

function getValue (metric) {
  return metric.value
}

function startAndWait (c, cb) {
  c.start((err) => {
    if (err) return cb(err)
    setTimeout(cb, 500)
  })
}
