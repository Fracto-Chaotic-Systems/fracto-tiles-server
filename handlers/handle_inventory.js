import {stream_json} from "../../../sdk/utils/StreamJson.js";

const TILES_DIR = '../../../tiles'

const filepath = `${TILES_DIR}/manifest.json`
stream_json(filepath, result=> {
   console.log('stream_json result', result)
})
