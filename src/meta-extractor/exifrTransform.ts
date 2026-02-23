import type { TagInput } from "./graphqlTypes.ts";

export default function (exifrData: ExifrRawData): TagInput[] {
  if (!exifrData || Reflect.ownKeys(exifrData).length === 0) return [];

  const {
    Orientation: orientation,
    CreateDate: dateCreated,
    ExifImageWidth: width,
    ExifImageHeight: height,
    Make: make,
    Model: model,
    latitude,
    longitude
  } = exifrData;

  return [
    ...(make ? [{ key: "make", value: make }] : []),
    ...(model ? [{ key: "model", value: model }] : []),
    ...(orientation ? [{ key: "orientation", value: orientation }] : []),
    ...(width ? [{ key: "width", value: String(width) }] : []),
    ...(height ? [{ key: "height", value: String(height) }] : []),
    ...(latitude ? [{ key: "latitude", value: String(latitude) }] : []),
    ...(longitude ? [{ key: "longitude", value: String(longitude) }] : []),
    ...(dateCreated
      ? [{ key: "dateCreated", value: dateCreated.toISOString() }]
      : []),
    ...(dateCreated
      ? [{ key: "dayCreated", value: String(dateCreated.getDate()) }]
      : []),
    ...(dateCreated
      ? [{ key: "monthCreated", value: String(dateCreated.getMonth() + 1) }]
      : []),
    ...(dateCreated
      ? [{ key: "yearCreated", value: String(dateCreated.getFullYear()) }]
      : [])
  ];
}

type ExifrRawData = {
  Make?: string;
  Model?: string;
  Orientation?: string;
  XResolution?: number;
  YResolution?: number;
  ResolutionUnit?: string;
  Software?: string;
  ModifyDate?: string;
  YCbCrPositioning?: number;
  ExposureTime?: number;
  FNumber?: number;
  ExposureProgram?: string;
  ISO?: number;
  ExifVersion?: string;
  DateTimeOriginal?: string;
  CreateDate?: Date;
  OffsetTime?: string;
  OffsetTimeOriginal?: string;
  OffsetTimeDigitized?: string;
  ShutterSpeedValue?: number;
  ApertureValue?: number;
  BrightnessValue?: number;
  ExposureCompensation?: number;
  MeteringMode?: string;
  Flash?: string;
  FocalLength?: number;
  ColorSpace?: number;
  ExifImageWidth?: number;
  ExifImageHeight?: number;
  SensingMethod?: string;
  SceneType?: string;
  ExposureMode?: string;
  WhiteBalance?: string;
  FocalLengthIn35mmFormat?: number;
  SceneCaptureType?: string;
  LensInfo?: Array<number | null>;
  LensMake?: string;
  LensModel?: string;
  CompositeImage?: string;
  latitude?: number;
  longitude?: number;
  GPSLatitudeRef?: string;
  GPSLatitude?: Array<number>;
  GPSLongitudeRef?: string;
  GPSLongitude?: Array<number>;
  GPSAltitudeRef?: { [key: string]: number };
  GPSAltitude?: number;
  GPSSpeedRef?: string;
  GPSSpeed?: number;
  GPSImgDirectionRef?: string;
  GPSImgDirection?: number;
  GPSDestBearingRef?: string;
  GPSDestBearing?: number;
  GPSDateStamp?: string;
  GPSHPositioningError?: number;
};
