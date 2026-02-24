import "iron-session";

declare module "iron-session" {
  interface IronSessionData {
    isLoggedIn?: boolean;
    userId?: string;
    username?: string;
  }
}
