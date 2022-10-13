require('dotenv').config({ path: __dirname + '/.env' });
const express = require("express");
const AWS = require('aws-sdk');
const multer = require('multer');
const { v4: uuid} = require("uuid");
const path = require('path');
const data = require('./store');


const config = new AWS.Config({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
});
AWS.config = config;

const docClient = new AWS.DynamoDB.DocumentClient();
const tableName = 'QLSV';

//s3
const s3 = new AWS.S3 ({
    accessKeyId: process.env.ACCESS_KEY_ID,
	secretAccessKey: process.env.SECRET_ACCESS_KEY,
});

const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, '');
    },
});

function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());
    const minetype = fileTypes.test(file.mimetype);
    if (extname && minetype) {
        return cb(null, true);
    }
    return cb("Error: Image Only");
}

const upload = multer({
    storage,
    limits: { fileSize: 2000000 }, //2MB
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    },
});

const app = express();

app.use(express.static('./templates'));
app.set('view engine', 'ejs');
app.set('views', './templates');

app.get('/', (req, res) => {
    const params = {
        TableName: tableName,
    };
    docClient.scan(params, (err, data) => {
        if (err) {
            res.send('Internal server error');
        } else {
            return res.render('index', { sinhViens: data.Items });
            // console.log('data= ', JSON.stringify(data));
            // return res.render('index', { data: data.Items});
        }
    });
});

const CLOUD_FRONT_URL = 'https://d2f8vfx8asmcek.cloudfront.net/';

app.post("/", upload.single('image'), (req, res) => {
    const { ma_sv, stt, ten_sv, ngay_sinh, lop } = req.body;
    const image = req.file.originalname.split(".");
    const fileType = image[image.length -1];
    const filePath = `${uuid() + Date.now().toString()}.${fileType}`;
    const params = {
        Bucket: "uploads3-bucket-hieu2001",
        Key: filePath,
        Body: req.file.buffer
    }

    s3.upload(params, (err, data) =>{
        if (err) {
            console.log(err);
            return res.send('Internal Server Error');
        } else {
            const newItem = {
                TableName: tableName,
                Item: {
                    "ma_sv": ma_sv,
                    "stt": stt,
                    "ten_sv": ten_sv,
                    "ngay_sinh": ngay_sinh,
                    "lop": lop,
                    "image_url": `${CLOUD_FRONT_URL}${filePath}`
                },
            }

            docClient.put(newItem, (err, data) => {
                if (err) {
                    console.log(err);
                    return res.send("Inrenal server error");
                } else {
                    return res.redirect("/");
                }
            });
        }
    })
});

app.post('/delete', upload.fields([]), (req, res) => {
    const listItems = Object.keys(req.body);
    if (listItems == 0) {
        return res.redirect("/");
    }

    function onDeleteItem(index) {
        const params = {
            TableName: tableName,
            Key: {
                "ma_sv": listItems[index]
            }
        }
        docClient.delete(params, (err, data) => {
            if (err) {
                return res.send("Inrenal server error");
            } else {
                if (index > 0) {
                    onDeleteItem(index - 1);
                } else {
                    return res.redirect("/");
                }
            }
        })
    }

    onDeleteItem(listItems.length - 1);
})

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});