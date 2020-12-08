'use strict'

const single = require('@telemetry-js/metric').single
const Writable = require('readable-stream').Writable
const pipeline = require('readable-stream').pipeline
const split2 = require('split2')
const cp = require('child_process')
const EventEmitter = require('events').EventEmitter

class DmCollector extends EventEmitter {
  constructor (options) {
    super()

    if (!options) options = {}

    this._retryDelay = options.retryDelay || 30 * 60e3
    this._fillInterval = options.fillInterval || 12 * 60 * 60e3
    this._cmd = options.cmd || 'dmesg'
    this._args = options.args || ['--color=never', '-xwf', 'kern', '--time-format', 'iso']
    this._nowFn = options.now || Date.now

    this._restartTimer = null
    this._pendingStop = null
    this._dmesg = null
    this._pos = [0, 0]
    this._watch = this._watch.bind(this)

    this._counters = new Map([
      ['tcp', [
        { message: 'possible syn flooding', value: 0, lastSent: 0 },
        { message: 'too many orphaned sockets', value: 0, lastSent: 0 },
        { message: 'out of memory', value: 0, lastSent: 0 }
      ]],
      ['net_ratelimit', [
        { message: 'callbacks suppressed', value: 0, lastSent: 0 }
      ]]
    ])
  }

  start (callback) {
    for (const items of this._counters.values()) {
      for (const item of items) {
        item.value = 0
        item.lastSent = 0
      }
    }

    this._setPosition(this._nowFn(), 0)
    this._watch()

    process.nextTick(callback)
  }

  ping (callback) {
    let date
    const now = this._nowFn()

    for (const [subject, items] of this._counters) {
      for (const item of items) {
        const { message, value, lastSent } = item

        // Report periodically and on start even if 0
        if (value > 0 || (now - lastSent) >= this._fillInterval) {
          if (date === undefined) date = new Date(now)

          const tags = { subject, message }
          const opts = { unit: 'count', statistic: 'sum', tags, value, date }

          item.lastSent = now
          this.emit('metric', single('telemetry.dmesg.delta', opts))
        }

        item.value = 0
      }
    }

    // No need to dezalgo ping()
    callback()
  }

  stop (callback) {
    if (this._restartTimer !== null) {
      clearTimeout(this._restartTimer)
      this._restartTimer = null
      process.nextTick(callback)
    } else if (this._dmesg) {
      this._pendingStop = callback
      this._dmesg.kill()
    } else {
      process.nextTick(callback)
    }
  }

  _setPosition (ms, us) {
    this._pos[0] = ms
    this._pos[1] = us
  }

  _parse (line) {
    // Parse "facility  :level  : 2019-03-20T17:21:18,660780+0000 subject: msg"
    const res = /^([a-z]+)\s*:\s*([a-z]+)\s*:\s*([^\s]+)\s+([a-z\d_]+)\s*:\s*(.+)$/i.exec(line)
    if (res === null) return

    const [, /* facility */, /* level */, ts, subject, msg] = res
    const [date, time] = ts.split(',')
    const ms = new Date(date + 'Z').getTime()
    const us = parseInt(time.split('+')[0], 10)

    if (Number.isNaN(ms) || Number.isNaN(us)) return
    if (ms < this._pos[0] || (ms === this._pos[0] && us <= this._pos[1])) return

    this._setPosition(ms, us)

    const haystack = msg.toLowerCase()
    const items = this._counters.get(subject.toLowerCase())

    if (items !== undefined) {
      for (const item of items) {
        if (haystack.indexOf(item.message) >= 0) {
          item.value++
          break
        }
      }
    }
  }

  _watch () {
    this._restartTimer = null
    this._dmesg = cp.spawn(this._cmd, this._args, {
      stdio: ['ignore', 'pipe', 'ignore']
    })

    let finished = false

    const finish = (err) => {
      if (finished) return
      finished = true

      if (this._dmesg) {
        this._dmesg.kill()
        this._dmesg = null
      }

      if (this._pendingStop) {
        const callback = this._pendingStop
        this._pendingStop = null
        return callback(err)
      }

      if (err) {
        try {
          err.message = `${err.name} watching dmesg: ${err.message}`
          err.name = 'TelemetryWarning'
        } catch (_) {}

        process.emitWarning(err)
      } else {
        process.emitWarning('Stopped watching dmesg', 'TelemetryWarning')
      }

      this._restartTimer = setTimeout(this._watch, this._retryDelay)
    }

    const writable = new Writable({
      objectMode: true,
      write: (line, enc, next) => {
        if (finished) return

        try {
          this._parse(line)
        } catch (err) {
          return next(err)
        }

        next()
      }
    })

    pipeline(this._dmesg.stdout, split2(), writable, (err) => {
      // If the stream ended normally, then wait for `close` event below
      if (err) finish(err)
    })

    this._dmesg.on('close', (code) => {
      this._dmesg = null
      finish(code ? new Error(`Exited with code ${code}`) : null)
    })

    this._dmesg.on('error', (err) => {
      this._dmesg = null
      finish(err)
    })
  }
}

module.exports = function (options) {
  return new DmCollector(options)
}
