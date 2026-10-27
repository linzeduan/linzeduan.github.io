import data from './content.js';
import {reader,mountReader} from '../systems/reader.js';
export const render=()=>reader(data,'discipline');
export const mount=mountReader;
