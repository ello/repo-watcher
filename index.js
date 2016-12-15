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

var branchCmd = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repo })
var branch = `${branchCmd.stdout}`.trim()

var remoteCmd = spawnSync('git', ['config', `branch.${branch}.remote`], { cwd: repo })
var remote = `${remoteCmd.stdout}`.trim() || 'origin'

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
  left: '75%',
  width: '50%',
  top: 1,
  height: 1,
  fg: '#ffffff',
  tags: true,
  content: `{bold}q: quit{/}`,
})
screen.append(commandsBox)

screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  return process.exit(0)
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
  exec('git', ['pull', remote, branch], function() {
    mergeConflictCheck({ output: true })
  })
}

function exec(cmd, args, err) {
  var cmd = spawnSync(cmd, args, { cwd: repo })
  puts(cmd.stderr)
  puts(cmd.stdout)
  if (cmd.code !== 0 && err) {
    err()
  }
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
  filter: function(file, stat) {
    return !file.includes('/.git/')
  }
}
watch.watchTree(repo, watchRepoOpts, function (f, curr, prev) {
  var msg = null
  var commit = false
  if (typeof f == "object" && prev === null && curr === null) {
    msg = `watching ${repo} for changes`
  } else if (prev === null) {
    msg = `adding file ${f}`
    commit = true
  } else if (curr.nlink === 0) {
    msg = `removing file ${f}`
    commit = true
  } else {
    msg = `changed file ${f}`
    commit = true
  }

  if (msg) {
    puts(msg)

    if (mergeConflict && mergeConflictCheck()) {
      puts('Waiting for merge conflict resolution')
    }
    else if (commit) {
      commitWith(msg)
    }
  }
})

screen.render()
mergeConflictCheck({ output: true })
