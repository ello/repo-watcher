#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const program = require('commander');

program
  .usage('<repo folder>')
  .version('0.0.1')
  .parse(process.argv);

const folder = program.args[0]
if (!folder) {
  program.help()
  process.exit(1)
}

const repo = path.resolve(folder)
const repoGit = path.resolve(repo, '.git')

const spawn = require('child_process').spawn;
const spawnSync = require('child_process').spawnSync;

function currentBranch() {
  var branchCmd = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo })
  return `${branchCmd.stdout}`.trim()
}
var branch = currentBranch()

function currentRemote() {
  var remoteCmd = spawnSync('git', ['config', `branch.${branch}.remote`], { cwd: repo })
  return `${remoteCmd.stdout}`.trim() || 'origin'
}
var remote = currentRemote()

const blessed = require("blessed")
const watch = require("watch")

const screen = blessed.screen()
// It's annoying to remember 'screen.render' everywhere,
// so just force refresh every 0.1s
setInterval(function() {
  screen.render()
}, 100)

const log = blessed.box({
  scrollable: true,
  alwaysScroll: true,
  border: {
    type: 'line'
  , fg: '#ffffff'
  },
  left: 0,
  right: 0,
  top: 3,
  bottom: 0,
  fg: '#ffffff',
  mouse: true,
  tags: true,
})
screen.append(log)


const branchBox = blessed.box({
  border: {
    type: 'line'
  , fg: '#ffffff'
  },
  left: 0,
  width: '25%',
  top: 0,
  height: 3,
  fg: '#ffffff',
  tags: true,
  content: `branch: {bold}${branch}{/}`,
})
screen.append(branchBox)


const remoteBox = blessed.box({
  border: {
    type: 'line'
  , fg: '#ffffff'
  },
  left: '25%',
  width: '25%',
  top: 0,
  height: 3,
  fg: '#ffffff',
  tags: true,
  content: `remote: {bold}${remote}{/}`,
})
screen.append(remoteBox)


const commandsBox = blessed.box({
  left: '50%',
  width: '50%',
  top: 1,
  height: 1,
  fg: '#ffffff',
  tags: true,
  align: 'center',
  content: `{bold}q: quit{/}    {bold}k: clear log{/}`,
})
screen.append(commandsBox)

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0)
})

screen.key(['k'], function(ch, key) {
  log.setContent('')
})

var mergeConflict = false
function mergeConflictCheck(opts) {
  opts = opts || {}

  const mergeHead = path.resolve(repoGit, 'MERGE_HEAD')
  mergeConflict = fs.existsSync(mergeHead)
  if (mergeConflict && opts.output) {
    puts('Merge conflict detected in these files:')
    exec('git',  ['diff', '--name-only', '--diff-filter=U'])
  }
  return mergeConflict
}

var prevCommitMsg = null
function commitWith(msg) {
  if (mergeConflictCheck({ output: true })) {
    prevCommitMsg = msg
    return
  }

  prevCommitMsg = null

  exec('git', ['add', '.'])
  exec('git', ['commit', '-m', msg])
  if (exec('git', ['pull', remote, branch])) {
    exec('git', ['push', remote, branch])
  }
  else {
    mergeConflictCheck({ output: true })
  }
}

function exec(cmd, args) {
  var cmd = spawnSync(cmd, args, { cwd: repo })
  puts(cmd.stderr)
  puts(cmd.stdout)

  return !cmd.code
}

function puts() {
  const scroll = false

  if (log.getScrollHeight() <= log.height) {
    scroll = true
  }
  else if (log.getScrollHeight() - log.getScroll() <= 2 ) {
    scroll = true
  }

  var msg = ''
  for (arg of arguments) {
    if (msg.length) {
      msg += ' '
    }
    msg += `${arg}`
  }
  log.pushLine(msg)

  if (scroll) {
    log.setScrollPerc(100)
  }
}

const watchMergeOpts = {
  filter: function(file, stat) {
    return !file.includes('/.git/') || file.includes('.git/MERGE_HEAD')
  }
}
watch.watchTree(repo, watchMergeOpts, function (f, curr, prev) {
  if (curr && curr.nlink === 0) {
    puts('merge conflict resolved!')
    if (prevCommitMsg) {
      commitWith(prevCommitMsg)
    }
  }
})

const watchRepoOpts = {
  interval: 0.1,
  filter: function(file, stat) {
    return !file.includes('/.git/') && !file.includes('/Build/') && !file.includes('/vendor/')
  }
}
watch.watchTree(repo, watchRepoOpts, function (f, curr, prev) {
  var msg = null
  var commit = false
  const filename = (typeof f == "string" ? path.relative(repo, f) : null)

  if (typeof f == "object" && prev === null && curr === null) {
    msg = `watching ${repo} for changes`
  } else if (prev === null) {
    msg = `adding file ${filename}`
    commit = true
  } else if (curr.nlink === 0) {
    msg = `removing file ${filename}`
    commit = true
  } else {
    msg = `changed file ${filename}`
    commit = true
  }

  if (msg) {
    puts(msg)

    if (branch != currentBranch()) {
      puts(`Branch change detected, ignoring (was {bold}${branch}{/} now {bold}${currentBranch()}{/})`)
    }
    else if (mergeConflict && mergeConflictCheck()) {
      puts('Waiting for merge conflict resolution')
    }
    else if (commit) {
      commitWith(msg)
    }
  }
})

screen.render()
mergeConflictCheck({ output: true })
