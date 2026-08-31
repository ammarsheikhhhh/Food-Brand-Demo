// ============================================================================
// storage.js — tiny async JSON "database" used everywhere we need to persist
// ----------------------------------------------------------------------------
// Why this exists: the original server.js read/wrote orders.json synchronously
// (fs.readFileSync / fs.writeFileSync). That's fine for one user, but if two
// orders arrive at the same time, one write can clobber the other.
//
// The fix: every read+modify+write on a file goes through a single in-process
// queue per file, and uses fs.promises under the hood. That way "load → mutate
// → save" is always atomic from the server's point of view.
//
// What it gives you:
//   - storage.read('orders')         -> Promise<array>
//   - storage.append('orders', item) -> Promise<void>     (push to array)
//   - storage.update('orders', fn)   -> Promise<array>    (mutate in place)
//   - storage.save('orders', array)  -> Promise<void>     (overwrite whole file)
//
// If the file doesn't exist yet, it's treated as []. The data/ folder is
// created on first write.
// ============================================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// A per-file promise chain. We tack the next operation on with .then(), so
// even when many requests come in at once they run strictly one after another.
const queues = new Map();

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(name) {
  return path.join(DATA_DIR, name + '.json');
}

function readFileSafe(name) {
  const file = filePath(name);
  if (!fs.existsSync(file)) return [];
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw.trim()) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // If the JSON is corrupt, we don't want to crash the server — log it and
    // start fresh. The original (broken) data is left in place so a human
    // can recover it.
    console.error(`[storage] Could not parse ${name}.json, starting fresh:`, err.message);
    return [];
  }
}

function writeFileSafe(name, data) {
  ensureDir();
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2));
}

// Run `task` after every previously-queued task for the same file finishes.
function enqueue(name, task) {
  const previous = queues.get(name) || Promise.resolve();
  const next = previous.then(task, task); // run even if the previous one rejected
  // Don't let one failure poison the whole chain forever.
  queues.set(name, next.catch(() => {}));
  return next;
}

const storage = {
  // Read whatever's in the file right now.
  read(name) {
    return enqueue(name, () => readFileSafe(name));
  },

  // Overwrite the file with the given array.
  save(name, data) {
    return enqueue(name, () => {
      if (!Array.isArray(data)) {
        throw new Error(`storage.save('${name}') expects an array`);
      }
      writeFileSafe(name, data);
    });
  },

  // Load the array, push `item` onto it, save it back, return the new length.
  async append(name, item) {
    return enqueue(name, () => {
      const arr = readFileSafe(name);
      arr.push(item);
      writeFileSafe(name, arr);
      return arr.length;
    });
  },

  // Load the array, run `mutator(arr)`, save it back, return the new array.
  // `mutator` can mutate the array in place or return a new one.
  async update(name, mutator) {
    return enqueue(name, () => {
      const arr = readFileSafe(name);
      const result = mutator(arr);
      const next = result === undefined ? arr : result;
      if (!Array.isArray(next)) {
        throw new Error(`storage.update('${name}') mutator must return an array`);
      }
      writeFileSafe(name, next);
      return next;
    });
  }
};

module.exports = storage;
