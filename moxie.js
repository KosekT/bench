import generateReportCard from './passes';
import SkillData from './SkillData';
import SkillIds from './SkillIds';
import TargetSelect from './TargetSelect';
import EIParser from './EIParser';
import getBenchmarkForPlayer from './benchmark';
import drawCastTimeline from './drawCastTimeline';
import drawBuffTimeline from './drawBuffTimeline';
import drawDpsGraph from './drawDpsGraph';
import EasterEgg from './EasterEgg';

const setupContainer = document.querySelector('.setup-container');
setup();

async function setup() {
  const dpsReportText = document.querySelector('.dpsreport-text');
  const dpsReportSubmit = document.querySelector('.dpsreport-submit');

  function dpsReportListener() {
    let urlText = dpsReportText.value.trim();
    if (!/^https:\/\/dps\.report\/[^/]+$/.test(urlText)) {
      alert('Paste in format https://dps.report/Sosx-20180802-193036_cairn');
      return;
    }
    let url = new URL(urlText);
    dpsReportSubmit.value = 'Fetching';
    dpsReportSubmit.removeEventListener('click', dpsReportListener);
    dpsReportSubmit.removeEventListener('keypress', dpsTextListener);
    loadDpsReport(url.pathname.substr(1));
  }

  function dpsTextListener(event) {
    if (event.key === 'Enter') {
      dpsReportListener();
    }
  }

  dpsReportSubmit.addEventListener('click', dpsReportListener);
  dpsReportText.addEventListener('keypress', dpsTextListener);

  let logInput = document.getElementById('log-input');
  logInput.addEventListener('change', function() {
    let logLabel = document.querySelector('#log-input + label');
    logLabel.textContent = 'Parsing';

    let file = logInput.files[0];

    setTimeout(function() {
      loadEIJson(file);
    }, 100);
  });
  setupContainer.classList.remove('hidden');

  let videoContainer = document.querySelector('.gameplay-video-container');
  let video = document.querySelector('.gameplay-video');
  let videoInput = document.getElementById('video-input');
  videoInput.addEventListener('change', function() {
    let logLabel = document.querySelector('#video-input + label');
    logLabel.textContent = 'Uploading';

    let file = videoInput.files[0];

    setTimeout(function() {
      const reader = new FileReader();
      reader.onload = function(event) {
        console.log('woot');
        let source = document.createElement('source');
        source.src = event.target.result;
        source.type = file.type;

        video.appendChild(source);

        videoContainer.classList.remove('no-video');
      };
      reader.onprogress = function(event) {
        if (event.lengthComputable) {
          let percent = Math.floor(100 * event.loaded / event.total) + '%';
          logLabel.textContent = 'Uploading ' + percent;
        }
      };

      reader.readAsDataURL(file);
    }, 100);
  });
}

function loadEIJson(file) {
  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const contents = event.target.result;
      let log = EIParser.parseJson(JSON.parse(contents));
      setupContainer.classList.add('hidden');
      displayHeader(log);
    } catch (_e) {
      alert('Failed to parse log file, should be JSON blob');
    }
  };
  reader.readAsText(file);
}

function loadDpsReport(slug) {
  EIParser.getJson(slug).then(function(log) {
    if (!log) {
      // TODO: should reset state of app
      return;
    }
    setupContainer.classList.add('hidden');
    displayHeader(log);
  }).catch(_ => {
    alert('failed to fetch that log, typo maybe?');
  });
}

function displayHeader(log) {
  console.log('log', log);
  let targetSelect = new TargetSelect(log);
  targetSelect.listener = function(selectedPlayer) {
    displayLog(log, selectedPlayer);
  };
  targetSelect.render();
}

async function displayLog(log, selectedPlayer) {
  console.log(selectedPlayer, log);
  log.casts = log.casts[selectedPlayer.id];
  log.buffs = log.buffs[selectedPlayer.id];
  log.targetDamage1S = log.targetDamage1S[selectedPlayer.id];

  const toggleBenchmark = document.querySelector('.toggle-benchmark');

  log.casts.sort(function(a, b) {
    return a.start - b.start;
  });
  const usedSkills = {};
  for (let cast of log.casts) {
    usedSkills[cast.id] = true;
  }

  for (let id in log.skills) {
    if (!/^[A-Z]/.test(log.skills[id])) {
      continue;
    }
    usedSkills[id] = true;
  }

  await SkillData.load(usedSkills);

  document.querySelector('.container').classList.remove('hidden');
  const width = (log.end - log.start) / 20; // 20 ms = 1 pixel
  const railHeight = 20;
  const railPad = 4;
  let videoOffset = 1.8;

  const video = document.querySelector('.gameplay-video');
  const timeline = document.querySelector('.timeline');
  const boardContainer = document.createElement('div');
  boardContainer.classList.add('board-container');
  boardContainer.classList.add('show-benchmark');
  const board = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  board.style.width = width + 'px';

  const legend = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  legend.classList.add('legend');
  legend.classList.add('show-benchmark');

  function timeToX(time) {
    return width * (time - log.start) / (log.end - log.start);
  }

  function xToTime(x) {
    return (x / width) * (log.end - log.start) + log.start;
  }
  window.timeToX = timeToX;
  window.xToTime = xToTime;

  const bonusSkills = {
    [SkillIds.ATTUNEMENT_FIRE_AIR]: 'Fire/Air',
    [SkillIds.ATTUNEMENT_FIRE_FIRE]: 'Fire/Fire',
    [SkillIds.ATTUNEMENT_AIR_FIRE]: 'Air/Fire',
    [SkillIds.ATTUNEMENT_AIR_AIR]: 'Air/Air',
  };

  for (const id in bonusSkills) {
    log.skills[id] = bonusSkills[id];
  }

  const dimensions = {
    railHeight,
    railPad,
    width,
    timeToX,
  };

  let row = 3;

  let benchmark = getBenchmarkForPlayer(log, selectedPlayer);
  drawDpsGraph(board, log, benchmark, dimensions);

  // Normalization, should be in other direction but that's difficult
  for (const cast of benchmark.casts) {
    cast.start += log.start;
    cast.end += log.start;
  }
  drawCastTimeline(board, log, benchmark.casts, row, dimensions, 'benchmark');

  const name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  name.textContent = 'Benchmark';
  name.setAttribute('x', 0);
  name.setAttribute('y', row * (railHeight + railPad) + railHeight / 2);
  name.classList.add('name');
  legend.appendChild(name);

  row += 1;

  drawCastTimeline(board, log, log.casts, row, dimensions);
  const buffCount = drawBuffTimeline(board, legend, log, row + 1, dimensions);

  const dpsGraphLabel = document.createElementNS('http://www.w3.org/2000/svg',
                                                 'text');
  dpsGraphLabel.textContent = 'Damage per 10s';
  dpsGraphLabel.setAttribute('x', 0);
  dpsGraphLabel.setAttribute('y', railHeight / 2);
  dpsGraphLabel.classList.add('name');
  legend.appendChild(dpsGraphLabel);


  const rowCount = buffCount + 1 + row;
  board.style.height = rowCount * (railHeight + railPad) - railPad + 'px';
  legend.style.height = rowCount * (railHeight + railPad) - railPad + 'px';

  timeline.appendChild(legend);
  boardContainer.appendChild(board);
  timeline.appendChild(boardContainer);

  const needle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  needle.setAttribute('x', 0);
  needle.setAttribute('y', 0);
  needle.setAttribute('width', 2);
  needle.setAttribute('height', rowCount * (railHeight + railPad) - railPad);
  needle.classList.add('needle');
  board.appendChild(needle);

  video.addEventListener('timeupdate', function() {
    scrollToLogTime((video.currentTime - videoOffset) * 1000 + log.start);
  });

  generateReportCard(log, selectedPlayer);

  let boardContainerRect = boardContainer.getBoundingClientRect();
  function scrollToLogTime(logTime, scrollVideo) {
    const logX = timeToX(logTime);
    needle.setAttribute('x', logX);
    if (!scrollVideo || logX < boardContainer.scrollLeft ||
        logX > boardContainer.scrollLeft + boardContainerRect.width) {
      boardContainer.scrollLeft = logX - boardContainerRect.width / 2;
    }
    if (scrollVideo) {
      video.currentTime = (logTime - log.start) / 1000 + videoOffset;
    }
  }

  board.addEventListener('click', function(event) {
    let totalX = event.clientX + boardContainer.scrollLeft -
      boardContainerRect.left;
    let logTime = xToTime(totalX);
    scrollToLogTime(logTime, true);
  });

  document.body.addEventListener('click', function(event) {
    if (event.target.classList.contains('time-link')) {
      event.preventDefault();
      let start = parseFloat(event.target.dataset.start);
      if (start) {
        scrollToLogTime(start, true);
      }
    }
  });

  toggleBenchmark.addEventListener('click', function() {
    boardContainer.classList.toggle('show-benchmark');
    legend.classList.toggle('show-benchmark');
    const showOrHide = legend.classList.contains('show-benchmark') ? '-' : '+';
    toggleBenchmark.textContent = showOrHide;
  });

  EasterEgg.attach();
}