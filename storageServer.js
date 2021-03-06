var formidable = require('formidable');
var fs = require('fs');
// key not synched on git
var key = fs.readFileSync('./selfCert.key');
var cert = fs.readFileSync('./selfCert.crt');
var https = require('https');
var http = require('http');
var fs = require('fs')
var crypto = require('crypto');
var IPFS = require('ipfs');
var url = require('url')
var https_options = {
        key: key,
        cert: cert
};

var PORT = 443;
var HOST = '0.0.0.0';

var ipfsNode = new IPFS()

ipfsNode.on('ready', (err) => {
        if (err) {
                console.error(err)
                process.exit(1)
        }

        var server =  https.createServer(https_options, function (req, res) {
                if (req.url == '/fileUpload' && req.method == 'POST') {

                        var form = new formidable.IncomingForm();

                        form.parse(req, function (err, fields, files) {


                                var privateKey = new Buffer(fields.secret);
                                // create read stream to encrypt and send to ipfs
                                if (typeof(files.filetoupload)==='undefined'){
                                        console.log('Fields is',fields,'\nFiles is\n',files)
                                        res.writeHead(400, {'Content-Type': 'text/html'});
                                        return res.end('Error: no file selected, please select a file to upload.')
                                }
                                var rstream = fs
                                        .createReadStream(files.filetoupload.path)
                                        .pipe(crypto.createCipher('aes-256-cbc', privateKey))


                                // Upload to IPFS
                                // Create the File to add, a file consists of a path + content. More details on
                                // https://github.com/ipfs/interface-ipfs-core/tree/master/API/files
                                // asynchronous server startup and upload
                                let fileMultihash

                                ipfsNode.files.add({
                                        path: 'private_data_if_no_permission_destroy.encr',
                                        content: rstream
                                }, 
                                        // When file loaded
                                        (err, result) => {
                                                if (err) { return cb(err) }
                                                console.log('\nAdded file:', result[0].path, result[0].hash)
                                                fileMultihash = result[0].hash
                                                let ipfsURL = 'https://ipfs.io/ipfs/' + fileMultihash 
                                                // Allows call from other domains when used as API endpoint
                                                res.setHeader('Access-Control-Allow-Origin', '*')

                                                if(typeof(fields.interactive)==='undefined' || parseInt(fields.interactive)){
                                                        res.writeHead(200, {'Content-Type': 'text/html'});
                                                        res.write('<h2> Your file is now stored using the interplanetary file system and will be permanently available here:</h2>')
                                                        res.write('The only way to read it from now on is to have the ipfs link:')
                                                        res.write('<br><a href="'+ipfsURL+ '">'+ipfsURL+'</a><br>')
                                                        res.write('<br>...and the secret you provided, it is posted here for the last time, then it will be erased forever:<br>'+fields.secret)
                                                        res.write('<br><br>the fileMultihash is (unique ID in ipfs URL above):<br>'+fileMultihash+'<br>')
                                                        res.write('<a href="https://dnacoinstorage.com/">Recover files here, or upload more.</a>'
                                                                ,res.end.bind(res)
                                                        )
                                                }
                                                else if(!parseInt(fields.interactive)){
                                                        console.log('non-interactive mode')
                                                        res.setHeader('Content-Type', 'application/json');
                                                        res.write(JSON.stringify({ hash: fileMultihash }), res.end.bind(res));
                                                
                                                }else{console.log('Error: cannot determine interactive status of session.')}
                                        }
                                )
                        })
                }
                else if (req.url == '/fileDownload' && req.method == 'POST') {


                        var form = new formidable.IncomingForm();

                        form.parse(req, function (err,fields){
                                let fileMultihash = fields.fileMultihash
                                ipfsNode.files.cat(fileMultihash,
                                        (err, stream) => {
                                                if (err) { return err }
                                                var decrypt = crypto.createDecipher('aes-256-cbc', new Buffer(fields.secret))
                                                res.writeHead(200, 
                                                        {
                                                                "Content-Disposition": 'attachment; filename="DNA.txt"',
                                                                'Content-Type': 'multipart/form-data; boundary=---------------------------974767299852498929531610575',
                                                                'Access-Control-Allow-Origin': '*'
                                                        })
                                                stream.on('close', () => {
                                                        res.end.bind(res)
                                                })
                                                decrypt.on("error", ()=>{
                                                        console.log('Wrong password.')
                                                        res.write('<h1>Wrong passsword.</h1>',
                                                                res.end.bind(res)
                                                        );
                                                })
                                                stream.pipe(decrypt).pipe(res) 
                                        }
                                )
                        })
                }

                else if (req.url == '/' && req.method == 'GET'){
                        // Upload form
                        res.setHeader('Access-Control-Allow-Origin', '*')
                        res.writeHead(200, {'Content-Type': 'text/html'});
                        res.write('<h1> Securely store files</h1>');
                        res.write('<p> Encrypts and uploads your file into a permanent peer-to-peer public storage. Locks your file with a secret so no one else can see your info.</p>');
                        res.write('<form action="fileUpload" method="post" enctype="multipart/form-data">');
                        res.write('Secret<br> <input type="text" name="secret"><br>');
                        res.write('File<br> <input type="file" name="filetoupload"><br>');
                        res.write('<br><input type="submit">');
                        res.write('</form>');
                        res.write('<h1> Recover files</h1>');
                        res.write('Enter ipfs multihash and secret to retrieve previously stored information.<br>');
                        res.write('<form action="/fileDownload" method="post">');
                        res.write('<br>IPFS file multihash<br> <input type="text" name="fileMultihash"><br>');
                        res.write('Secret<br> <input type="text" name="secret"><br>');
                        res.write('<br><input type="submit" >')
                        res.write('</form>');
                        res.write('<p>* this service is used by <a href="https://dnavid.com" target="_blank">DNA ID</a> to upload personal DNA information safely, while retaining ownership and control. Contact on Twitter: <a href="https://twitter.com/davidweisss" target="_blank">@davidweisss</a><p>');
                        res.write('<h1>How it works</h1>');
                        res.write('<iframe width="560" height="315" src="https://www.youtube.com/embed/KJKNyoJBD4U?rel=0" frameborder="0" allowfullscreen></iframe>')
                        return res.end();
                } else{
                        res.writeHead(404, {'Content-Type': 'text/html'});
                        return res.end('The page does not exist.')
                }
        }).on('listening', (err) => {
                if (err) {
                        console.error(err)
                        process.exit(1)
                }
                console.log('HTTPS Server listening on %s:%s', HOST, PORT)
        }).listen(PORT, HOST);
})
// start server
//server = https.createServer(https_options, app).listen(PORT, HOST);
console.log('HTTPS Server listening on %s:%s', HOST, PORT);

// Redirect from http port 80 to https
http.createServer(function (req, res) {
        res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
        res.end();
}).listen(80);
