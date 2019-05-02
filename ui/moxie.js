import generateReportCard from './passes';
import SkillData from './SkillData';
const rustLoad = import('../pkg/moxie');

const setupContainer = document.querySelector('.setup-container');
setup();

async function setup() {
  let moxieParser = await rustLoad;

  let logInput = document.querySelector('.log-input');
  logInput.addEventListener('change', function() {
    const reader = new FileReader();
    reader.onload = function(event) {
      console.log(event.target.result);
      const contents = new Uint8Array(event.target.result);
      let log = moxieParser.generate_object(contents);
      setupContainer.classList.add('hidden');
      displayLog(log);
    };
    reader.readAsArrayBuffer(logInput.files[0]);
  });
  setupContainer.classList.remove('hidden');
}

async function displayLog(log) {
  console.log(log);

  log.casts.sort(function(a, b) {
    return a.start - b.start;
  });
  const usedSkills = {};
  for (let cast of log.casts) {
    usedSkills[cast.id] = true;
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
  const board = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  board.style.width = width + 'px';

  const legend = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  legend.classList.add('legend');

  let row = 0;
  function timeToX(time) {
    return width * (time - log.start) / (log.end - log.start);
  }

  function xToTime(x) {
    return (x / width) * (log.end - log.start) + log.start;
  }
  window.timeToX = timeToX;
  window.xToTime = xToTime;

  const bonusSkills = {
    43229: 'Fire/Air',
    43470: 'Fire/Fire',
    42811: 'Air/Fire',
    42264: 'Air/Air',
  };

  for (const id in bonusSkills) {
    log.skills[id] = bonusSkills[id];
  }

  row += 1;

  const boringBuffs = {
    'Do Nothing Transformation Buff': true,
    'Conjure Fire Attributes': true,
    'Ride the Lightning': true,
    'Signet of Restoration': true,
    'Elemental Refreshment': true,
    'Fire Aura': true,
    'Fire Attunement': true,
    'Water Attunement': true,
    'Air Attunement': true,
    'Earth Attunement': true,
    'The Light of Deldrimor': true,
  };

  const boringSkills = {
    40183: true, // Primordial Stance
  };

  const weaverBuffs = {
    'Fire/Fire': 0,
    'Air/Fire': 1,
    'Air/Air': 2,
    'Fire/Air': 3,
    // 'Fire Attunement': 0,
    // 'Water Attunement': 1,
    // 'Air Attunement': 2,
    // 'Earth Attunement': 3,
    'Elements of Rage': 4,
    'Primordial Stance': 5,
  };

  const buffIds = Object.keys(log.buffs).sort((a, b) => {
    let aName = log.skills[a];
    let bName = log.skills[b];
    if (weaverBuffs.hasOwnProperty(aName)) {
      if (weaverBuffs.hasOwnProperty(bName)) {
        return weaverBuffs[aName] - weaverBuffs[bName];
      }
      return -1;
    } else if (weaverBuffs.hasOwnProperty(bName)) {
      return 1;
    }
    return aName.localeCompare(bName);
  });

  for (const buffId of buffIds) {
    // if (/^[+(12]/.test(skills[buffId])) {
    //   continue;
    // }
    if (!/^[A-Z]/.test(log.skills[buffId])) {
      continue;
    }

    if (log.skills[buffId].startsWith('Guild')) {
      continue;
    }

    if (boringBuffs[log.skills[buffId]]) {
      continue;
    }

    const rects = [];
    for (const event of log.buffs[buffId]) {
      if (event.Apply) {
        const rect = document.createElementNS('http://www.w3.org/2000/svg',
                                              'rect');
        rect.setAttribute('x', timeToX(event.Apply));
        rect.setAttribute('y', (railHeight + railPad) * row);
        rect.setAttribute('height', railHeight);
        rects.push(rect);
      }
      if (event.Remove) {
        const rect = rects.pop();
        if (!rect) {
          continue;
        }
        rect.setAttribute('width', timeToX(event.Remove) -
                          rect.getAttribute('x'));
        rect.classList.add('buff');
        board.appendChild(rect);
      }
    }
    for (const rect of rects.reverse()) {
      rect.setAttribute('width', timeToX(log.end) - rect.getAttribute('x'));
      rect.classList.add('buff');
      board.appendChild(rect);
    }
    const name = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    name.textContent = log.skills[buffId];
    name.setAttribute('x', 0);
    name.setAttribute('y', row * (railHeight + railPad) + railHeight / 2);
    name.classList.add('name');
    legend.appendChild(name);
    row += 1;
  }

  board.style.height = row * (railHeight + railPad) - railPad + 'px';
  legend.style.height = row * (railHeight + railPad) - railPad + 'px';

  timeline.appendChild(legend);
  boardContainer.appendChild(board);
  timeline.appendChild(boardContainer);

  for (const cast of log.casts) {
    if (boringSkills[cast.id]) {
      continue;
    }
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

    const title = document.createElementNS('http://www.w3.org/2000/svg',
                                           'title');
    let label = log.skills[cast.id] || cast.id;
    label += ` (${((cast.start - log.start) / 1000).toFixed(2)}s)`;
    title.textContent = label;

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('cast');
    if (!cast.fired) {
      rect.classList.add('cancel');
    }

    let text = null;

    let data = SkillData.get(cast.id);
    if (data && data.slot) {
      let content = '';
      let matches = data.slot.match(/Weapon_(\d)/);
      if (matches && matches.length > 0) {
        content = matches[1];
        if (data.prev_chain && !data.next_chain) {
          content += 'f';
        }
      }
      if (data.slot === 'Elite') {
        content = 'E';
      } else if (data.slot === 'Utility') {
        content = 'U';
      }

      text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', timeToX(cast.start));
      text.setAttribute('y', railHeight / 2);
      text.classList.add('name');
      text.textContent = content;
    }

    rect.setAttribute('x', timeToX(cast.start));
    rect.setAttribute('y', 0);
    if (cast.end - cast.start > 0) {
      rect.setAttribute('width', timeToX(cast.end) - timeToX(cast.start));
    } else {
      rect.setAttribute('width', 2);
      rect.classList.add('cast-instant');
    }

    rect.setAttribute('height', railHeight);

    g.appendChild(title);
    g.appendChild(rect);
    if (text) {
      g.appendChild(text);
    }
    board.appendChild(g);
  }

  const needle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  needle.setAttribute('x', 0);
  needle.setAttribute('y', 0);
  needle.setAttribute('width', 2);
  needle.setAttribute('height', row * (railHeight + railPad) - railPad);
  needle.classList.add('needle');
  board.appendChild(needle);

  video.addEventListener('timeupdate', function() {
    scrollToLogTime((video.currentTime - videoOffset) * 1000);
  });

  generateReportCard(log);


  let boardContainerRect = boardContainer.getBoundingClientRect();
  function scrollToLogTime(logTime, scrollVideo) {
    const logX = timeToX(logTime);
    needle.setAttribute('x', logX);
    if (!scrollVideo || logX < boardContainer.scrollLeft ||
        logX > boardContainer.scrollLeft + boardContainerRect.width) {
      boardContainer.scrollLeft = logX - boardContainerRect.width / 2;
    }
    if (scrollVideo) {
      video.currentTime = logTime / 1000 + videoOffset;
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
}
