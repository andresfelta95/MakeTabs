import axios from "axios";

const client = axios.create({
  baseURL: "/api",
  withCredentials: true, // send session cookie on every request
});

export default client;
