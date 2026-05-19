import axios from "axios";

const client = axios.create({
  baseURL: "/",
  withCredentials: true, // send session cookie on every request
});

export default client;
