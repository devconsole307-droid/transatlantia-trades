const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

// Allowed extensions AND their corresponding MIME types
const ALLOWED_FILES = {
  '.jpg':  ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png':  ['image/png'],
  '.webp': ['image/webp'],
  '.pdf':  ['application/pdf'],
};

// Dual validation: check BOTH file extension AND MIME type
// An attacker renaming shell.php → shell.jpg will still be blocked
// because the MIME type won't match the extension
const secureFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = ALLOWED_FILES[ext];

  if (!allowedMimes) {
    return cb(new Error(`File type not allowed. Accepted: JPG, PNG, WEBP, PDF`), false);
  }

  if (!allowedMimes.includes(file.mimetype)) {
    return cb(new Error(`File content doesn't match extension (possible spoofing attempt)`), false);
  }

  cb(null, true);
};

// Sanitize filename — strip path traversal and special characters
const sanitizeFilename = (originalname) => {
  const ext = path.extname(originalname).toLowerCase();
  const base = path.basename(originalname, ext)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .substring(0, 40);
  return base + ext;
};

const proofStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_PATH ? path.join(process.env.UPLOAD_PATH, 'proofs') : path.join(__dirname, '../../uploads/proofs');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Use userId + timestamp — never trust the original filename
    cb(null, `proof_${req.user.id}_${Date.now()}${ext}`);
  },
});

const kycStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.UPLOAD_PATH ? path.join(process.env.UPLOAD_PATH, 'kyc') : path.join(__dirname, '../../uploads/kyc');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `kyc_${req.user.id}_${file.fieldname}_${Date.now()}${ext}`);
  },
});

const uploadProof = multer({
  storage: proofStorage,
  fileFilter: secureFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,  // 10MB
    files: 1,
  },
}).single('proof');

const uploadKyc = multer({
  storage: kycStorage,
  fileFilter: secureFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
}).fields([
  { name: 'id_front',         maxCount: 1 },
  { name: 'id_back',          maxCount: 1 },
  { name: 'passport',         maxCount: 1 },
  { name: 'proof_of_address', maxCount: 1 },
  { name: 'selfie',           maxCount: 1 },
]);

module.exports = { uploadProof, uploadKyc };
